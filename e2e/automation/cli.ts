import path from "node:path";
import readline from "node:readline";
import { z } from "zod";
import { AppSession } from "./session";
import { startSite } from "./site";
import { waitUntil } from "./wait";

const target = z.string().describe("Stable ID from targets, e.g. window:1 or tab:UUID");
const locator = {
  target,
  selector: z.string().describe("Playwright selector, e.g. role=button[name='Zoom in']"),
};
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("targets") }),
  z.object({ action: z.literal("inspect"), target }),
  z.object({ action: z.literal("click"), ...locator }),
  z.object({ action: z.literal("fill"), ...locator, value: z.string() }),
  z.object({ action: z.literal("press"), target, key: z.string() }),
  z.object({
    action: z.literal("shortcut"),
    target,
    keyCode: z.string(),
    modifiers: z.array(z.enum(["control", "shift", "alt", "meta"])).default([]),
  }),
  z.object({ action: z.literal("scroll"), target, x: z.number(), y: z.number() }),
  z.object({ action: z.literal("drag"), ...locator, destination: z.string() }),
  z.object({ action: z.literal("upload"), ...locator, files: z.array(z.string()) }),
  z.object({
    action: z.literal("assert-text"),
    ...locator,
    text: z.string(),
    timeoutMs: z.number().int().min(1).max(30_000).default(5_000),
  }),
  z.object({ action: z.literal("event-cursor") }),
  z.object({ action: z.literal("wait-event"), name: z.string(), after: z.number().int().min(0) }),
  z.object({ action: z.literal("state"), feature: z.string().optional() }),
  z.object({ action: z.literal("commands") }),
  z.object({
    action: z.literal("setup-command"),
    name: z.string(),
    payload: z.unknown().optional(),
  }),
  z.object({ action: z.literal("capture"), label: z.string().regex(/^[a-zA-Z0-9_-]+$/) }),
  z.object({ action: z.literal("restart") }),
  z.object({ action: z.literal("stop") }),
]);

if (process.argv.includes("--help")) {
  console.log(
    JSON.stringify(
      {
        description:
          "JSONL stdin/stdout controller using the shared Playwright Electron fixture. Starts an isolated app and local fixture site. EOF or stop cleans up.",
        requests: z.toJSONSchema(requestSchema),
        examples: [
          { action: "targets" },
          { action: "shortcut", target: "window:1", keyCode: "T", modifiers: ["control"] },
        ],
      },
      null,
      2,
    ),
  );
} else {
  const session = new AppSession(path.resolve("test-results", `interactive-${Date.now()}`));
  let failureCount = 0;
  const site = await startSite();
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  // Install the iterator before launching Electron so piped input/EOF is buffered during startup.
  const input = lines[Symbol.asyncIterator]();
  process.once("SIGINT", () => lines.close());
  process.once("SIGTERM", () => lines.close());
  try {
    await session.launch();
    console.log(
      JSON.stringify({
        status: "ready",
        artifactDir: session.artifactDir,
        fixtureUrl: site.url,
        connection: await session.connection(),
        targets: await session.targets(),
      }),
    );
    for await (const line of input) {
      if (!line.trim()) continue;
      try {
        const request = requestSchema.parse(JSON.parse(line));
        session.record("action", request);
        let result: unknown;
        if (request.action === "stop") break;
        if ("target" in request) {
          const nativeTarget = await session.target((target) => target.id === request.target);
          const page = await session.page(nativeTarget);
          switch (request.action) {
            case "inspect":
              result = await session.inspect(nativeTarget);
              break;
            case "click":
              await page.locator(request.selector).click();
              break;
            case "fill":
              await page.locator(request.selector).fill(request.value);
              break;
            case "press":
              await page.keyboard.press(request.key);
              break;
            case "shortcut":
              await session.app.evaluate(
                ({ webContents }, input) => {
                  const wc = webContents.fromId(input.id);
                  if (!wc) throw new Error("Target closed");
                  wc.sendInputEvent({
                    type: "keyDown",
                    keyCode: input.keyCode,
                    modifiers: input.modifiers,
                  });
                  wc.sendInputEvent({
                    type: "keyUp",
                    keyCode: input.keyCode,
                    modifiers: input.modifiers,
                  });
                },
                {
                  id: nativeTarget.webContentsId,
                  keyCode: request.keyCode,
                  modifiers: request.modifiers,
                },
              );
              break;
            case "scroll":
              await page.mouse.wheel(request.x, request.y);
              break;
            case "drag":
              await page.locator(request.selector).dragTo(page.locator(request.destination));
              break;
            case "upload":
              await page.locator(request.selector).setInputFiles(request.files);
              break;
            case "assert-text":
              result = await waitUntil(
                `text ${request.text}`,
                () => page.locator(request.selector).textContent({ timeout: request.timeoutMs }),
                (text) => text === request.text,
                request.timeoutMs,
              );
              break;
          }
        } else {
          switch (request.action) {
            case "targets":
              result = await session.targets();
              break;
            case "event-cursor":
              result = await session.eventCursor();
              break;
            case "wait-event":
              result = await session.waitForEvent(request.name, request.after);
              break;
            case "state":
              result = await session.debug(
                request.feature ? `/state/${encodeURIComponent(request.feature)}` : "/state",
              );
              break;
            case "commands":
              result = await session.debug("/commands");
              break;
            case "setup-command":
              result = await session.command(request.name, request.payload);
              break;
            case "capture":
              result = await session.capture(request.label);
              break;
            case "restart":
              await session.restart();
              result = await session.targets();
              break;
          }
        }
        const partial =
          request.action === "capture" && (result as { status: string }).status === "partial";
        if (partial) process.exitCode = 1;
        console.log(
          JSON.stringify({
            status: partial ? "partial" : "passed",
            action: request.action,
            result,
          }),
        );
      } catch (error) {
        process.exitCode = 1;
        const evidenceLabel = `action-failure-${++failureCount}`;
        let captureError: string | undefined;
        try {
          await session.capture(evidenceLabel);
        } catch (problem) {
          captureError = String(problem);
        }
        console.log(
          JSON.stringify({
            status: "failed",
            error: error instanceof z.ZodError ? error.issues : String(error),
            evidenceLabel,
            captureError,
            artifactDir: session.artifactDir,
          }),
        );
      }
    }
  } finally {
    lines.close();
    await session.close();
    await site.close();
  }
}
