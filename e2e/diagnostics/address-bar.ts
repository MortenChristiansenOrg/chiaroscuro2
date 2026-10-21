import path from "node:path";
import type { RecordedEntry } from "../../src/features/debug-server/recorder";
import { AppSession } from "../automation/session";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { windowsPointer } from "../automation/windows-pointer";
import { VerificationPage } from "../pages/verification.page";

if (process.platform !== "win32") {
  throw new Error("Run natively on Windows, or use bun run verify:app:win --address-bar from WSL.");
}
const artifactDir = path.resolve(
  "test-results",
  "address-bar",
  new Date().toISOString().replaceAll(":", "-"),
);
const session = new AppSession(artifactDir);
const site = await startSite();
const observations: {
  input: string;
  name: string;
  part: string;
  activated: boolean;
  hovered: boolean;
  hitTest?: number;
  color: string;
  command: string;
  copyMatches?: boolean;
}[] = [];
let previousClipboard: string | undefined;
try {
  await session.launch();
  previousClipboard = await session.app.evaluate(({ clipboard }) => clipboard.readText());
  if (process.argv.includes("--maximized")) {
    await session.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => !win.getParentWindow())
        ?.maximize(),
    );
  }
  // Sites built for desktop app shells declare app-region. Left behind as a hidden tab, such a
  // page used to cover the whole top bar with its drag region (#51).
  await VerificationPage.navigate(session, `${site.url}/app-region`);
  const cases = [
    { name: "Reload", command: "window:reload" },
    { name: "Copy URL", command: "window:copy-address" },
    { name: "Domain customization", command: "domain-settings:open" },
    { name: /^Zoom \d+%/, command: "zoom:reset" },
  ];
  for (const input of ["cdp", "windows"] as const) {
    for (const { name, command } of cases) {
      for (const part of ["icon", "padding"] as const) {
        const url = `${site.url}/address-bar-hit-test`;
        const fixture = await VerificationPage.navigate(session, url);
        await fixture.message.waitFor({ state: "visible" });
        // The zoom indicator shows only at a non-default zoom.
        await session.command("zoom:in");
        const button = session.shell.getByRole("button", { name, exact: true });
        await button.waitFor({ state: "visible" });
        const geometry = await button.evaluate((button) => {
          const rect = (element: Element | Range) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          // An icon, or the text of a text button such as the zoom indicator.
          const range = document.createRange();
          range.selectNodeContents(button);
          const icon = button.querySelector("i") ?? range;
          const parent = button.parentElement;
          if (!parent) throw new Error("Button container missing");
          return {
            button: rect(button),
            icon: rect(icon),
            regions: [button, parent].map((element) => ({
              tag: element.tagName,
              appRegion: getComputedStyle(element).getPropertyValue("app-region"),
              pointerEvents: getComputedStyle(element).pointerEvents,
            })),
          };
        });
        const box = part === "icon" ? geometry.icon : geometry.button;
        const point = {
          x: box.x + (part === "icon" ? box.width / 2 : 2),
          y: box.y + box.height / 2,
        };
        const label = `${input}-${typeof name === "string" ? name.replaceAll(" ", "-") : "Zoom-indicator"}-${part}`;
        await session.writeJson(`${label}.geometry.json`, { geometry, point });
        const native = input === "windows" ? await windowsPointer(session, point) : undefined;
        if (input === "cdp") await session.shell.mouse.move(point.x, point.y);
        const hover = await button.evaluate(async (element) => {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { hovered: element.matches(":hover"), color: getComputedStyle(element).color };
        });
        await session.shell.screenshot({
          path: path.join(artifactDir, `${label}.hover.renderer.png`),
        });
        await session.app.evaluate(({ clipboard }) =>
          clipboard.writeText("address-bar-diagnostic-sentinel"),
        );
        const cursor = await session.eventCursor();
        if (input === "windows") await windowsPointer(session, point, true);
        else await session.shell.mouse.click(point.x, point.y);
        let activated = false;
        try {
          await waitUntil(
            command,
            () =>
              session.debug<{ entries: RecordedEntry[] }>(
                `/history?type=command&name=${encodeURIComponent(command)}&limit=100`,
              ),
            (history) => history.entries.some((entry) => entry.id > cursor),
            750,
          );
          activated = true;
        } catch (error) {
          session.record("diagnostic-missing-command", String(error));
        }
        const copyMatches =
          name === "Copy URL"
            ? (await session.app.evaluate(({ clipboard }) => clipboard.readText())) === url
            : undefined;
        const observation = {
          input,
          name: typeof name === "string" ? name : "Zoom indicator",
          part,
          ...hover,
          hitTest: native?.hitTest,
          command,
          activated,
          copyMatches,
        };
        observations.push(observation);
        session.record("address-bar-observation", observation);
        console.log(JSON.stringify(observation));
      }
    }
  }
  // Reload is affected as well (#51), so a caption hit test, not a control button, shows that
  // the window's drag region rather than the desktop input path blocked a click.
  const native = observations.filter((o) => o.input === "windows");
  const blocked = native.filter((o) => !o.activated);
  const blockedIcons = native.filter((o) => o.part === "icon").every((o) => !o.activated);
  const outcome = blocked.some((o) => o.hitTest !== 2)
    ? "inconclusive-input-failed"
    : blocked.length === 0
      ? "reported-behavior-not-reproduced"
      : blockedIcons && blocked.every((o) => o.part === "icon")
        ? "icons-blocked-padding-works"
        : "caption-blocks-controls";
  const evidence = await session.capture("diagnostic");
  const result = {
    outcome,
    blocked: blocked.map((o) => `${o.name} ${o.part}`),
    observations,
    evidenceStatus: evidence.status,
    artifactDir,
  };
  await session.writeJson("result.json", result);
  console.log(JSON.stringify(result));
  if (outcome === "inconclusive-input-failed" || evidence.status !== "complete")
    process.exitCode = 1;
} catch (error) {
  process.exitCode = 1;
  await session.writeJson("result.json", {
    outcome: "diagnostic-failed",
    error: String(error),
    observations,
  });
  await session.capture("failure").catch(() => {});
  throw error;
} finally {
  if (previousClipboard !== undefined) {
    await session.app
      .evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard)
      .catch(() => {});
  }
  await session.close();
  await site.close();
}
