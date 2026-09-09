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
  const cases = [
    { name: "Reload", command: "window:reload" },
    { name: "Copy URL", command: "window:copy-address" },
    { name: "Domain customization", command: "domain-settings:open" },
  ];
  for (const input of ["cdp", "windows"] as const) {
    for (const { name, command } of cases) {
      for (const part of ["icon", "padding"] as const) {
        const url = `${site.url}/address-bar-hit-test`;
        const fixture = await VerificationPage.navigate(session, url);
        await fixture.message.waitFor({ state: "visible" });
        const button = session.shell.getByRole("button", { name, exact: true });
        await button.waitFor({ state: "visible" });
        const geometry = await button.evaluate((button) => {
          const rect = (element: Element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          const icon = button.querySelector("i");
          if (!icon) throw new Error("Button icon missing");
          const parent = button.parentElement;
          if (!parent) throw new Error("Button container missing");
          return {
            button: rect(button),
            icon: rect(icon),
            regions: [icon, button, parent].map((element) => ({
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
        const label = `${input}-${name.replaceAll(" ", "-")}-${part}`;
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
          name,
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
  const controlWorks = observations.some(
    (o) => o.input === "windows" && o.name === "Reload" && o.activated,
  );
  const affected = observations.filter((o) => o.input === "windows" && o.name !== "Reload");
  const blockedIcons = affected
    .filter((o) => o.part === "icon")
    .every((o) => !o.activated && o.hitTest === 2);
  const workingPadding = affected.filter((o) => o.part === "padding").every((o) => o.activated);
  const outcome = !controlWorks
    ? "inconclusive-control-failed"
    : blockedIcons
      ? workingPadding
        ? "reported-behavior-reproduced"
        : "icons-blocked-padding-also-blocked"
      : "reported-behavior-not-reproduced";
  const evidence = await session.capture("diagnostic");
  const result = {
    outcome,
    controlWorks,
    observations,
    evidenceStatus: evidence.status,
    artifactDir,
  };
  await session.writeJson("result.json", result);
  console.log(JSON.stringify(result));
  if (!controlWorks || evidence.status !== "complete") process.exitCode = 1;
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
