import path from "node:path";
import { AppSession } from "../automation/session";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { VerificationPage } from "../pages/verification.page";

// Optional research diagnostic: records candidate limitations, not a passing
// assertion about native animation support. Never runs against a personal profile.
const site = await startSite();
try {
  for (const scale of [1, 1.5]) {
    const session = new AppSession(path.resolve(`test-results/native-views/scale-${scale}`), [
      `--force-device-scale-factor=${scale}`,
    ]);
    try {
      await session.launch();
      const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
      await parent.page.addStyleTag({
        content: "body{background:repeating-conic-gradient(#aaa 0% 25%,#fff 0% 50%) 0 0/24px 24px}",
      });
      const cursor = await session.eventCursor();
      await parent.subTab.click();
      await session.waitForEvent("sub-tabs:opened", cursor);
      const child = await session.target((t) => t.kind === "sub-tab" && t.visible);
      const childPage = new VerificationPage(await session.page(child));
      await childPage.submit("native candidate input");
      const results = await session.app.evaluate(
        async ({ BrowserWindow, WebContentsView }, wcId) => {
          const view = BrowserWindow.getAllWindows()
            .flatMap((w) => w.contentView.children)
            .find((v) => v instanceof WebContentsView && v.webContents.id === wcId);
          if (!view) throw new Error("No sub-tab view");
          // Fixed intervals here intentionally sample the 200 ms experimental transition.
          const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          await delay(250);
          const full = view.getBounds();
          const small = {
            x: full.x + 40,
            y: full.y + 40,
            width: full.width - 80,
            height: full.height - 80,
          };
          const measurements = [];
          for (const mode of ["timer", "native"] as const) {
            for (const load of [false, true]) {
              view.setBounds(small);
              const samples: { time: number; bounds: Electron.Rectangle }[] = [];
              const start = performance.now();
              const observe = () =>
                samples.push({ time: performance.now() - start, bounds: view.getBounds() });
              view.on("bounds-changed", observe);
              let calls = 0;
              if (mode === "native") {
                calls++;
                view.setBounds(full, { animate: { duration: 200, easing: "ease-out" } });
              } else {
                const tick = () => {
                  const t = Math.min((performance.now() - start) / 200, 1);
                  const eased = 1 - (1 - t) ** 2;
                  calls++;
                  view.setBounds({
                    x: Math.round(small.x + (full.x - small.x) * eased),
                    y: Math.round(small.y + (full.y - small.y) * eased),
                    width: Math.round(small.width + (full.width - small.width) * eased),
                    height: Math.round(small.height + (full.height - small.height) * eased),
                  });
                  if (t < 1) setTimeout(tick, 16);
                };
                tick();
              }
              if (load) {
                await delay(64);
                const until = performance.now() + 220;
                while (performance.now() < until) {
                  /* Deliberate main-process load. */
                }
              }
              await delay(400);
              view.removeListener("bounds-changed", observe);
              measurements.push({ mode, load, calls, samples, final: view.getBounds() });
            }
          }
          view.setBounds(small);
          view.setBounds(full, { animate: { duration: 200, easing: "ease-out" } });
          const start = view.getBounds();
          await delay(60);
          const middle = view.getBounds();
          const resized = { ...full, width: full.width - 120, height: full.height - 100 };
          view.setBounds(resized);
          await delay(250);
          const afterResize = view.getBounds();
          view.setBounds(full);
          return {
            full,
            small,
            measurements,
            interruption: { start, middle, resized, afterResize },
          };
        },
        child.webContentsId,
      );
      await session.writeJson("animation.json", results);
      await session.writeJson("environment.json", await session.environment());
      const frameTarget = await session.target((t) => t.kind === "sub-tab-frame");
      for (const radius of [0, 20]) {
        await session.app.evaluate(
          ({ BrowserWindow }, { id, radius }) => {
            const frame = BrowserWindow.fromId(id);
            if (!frame) throw new Error("No sub-tab frame");
            frame.contentView.setBackgroundColor("#01000000");
            frame.contentView.setBackgroundBlur(radius);
          },
          { id: frameTarget.windowId ?? 0, radius },
        );
        await session.composedCapture(`cross-window-blur-${radius}`);
      }
      await (await session.page(frameTarget))
        .getByRole("button", { name: "Close sub-tab", exact: true })
        .click();
      await session.target((t) => t.id === child.parentId && t.visible);
      // Wait for native removal before capturing the unobstructed positive control.
      await waitUntil(
        "sub-tab removal",
        () => session.targets(),
        (targets) => !targets.some((t) => t.id === child.id),
      );
      // Positive control: blur a sibling in the SAME native compositor tree.
      await session.app.evaluate(({ BrowserWindow, View }) => {
        const shell = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
        if (!shell) throw new Error("No shell");
        const overlay = new View();
        overlay.setBounds({ x: 400, y: 100, width: 240, height: 160 });
        overlay.setBackgroundColor("#40000000");
        overlay.setBackgroundBlur(0);
        shell.contentView.addChildView(overlay);
      });
      await session.composedCapture("same-window-blur-0");
      await session.app.evaluate(({ BrowserWindow }) => {
        const shell = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
        shell?.contentView.children.at(-1)?.setBackgroundBlur(20);
      });
      await session.composedCapture("same-window-blur-20");
      const evidence = await session.capture("diagnostic-final");
      if (evidence.status !== "complete") throw new Error("Incomplete native-view evidence");
      console.log(
        JSON.stringify({
          scale,
          interruption: results.interruption,
          measurements: results.measurements.map((m) => ({
            mode: m.mode,
            load: m.load,
            calls: m.calls,
            samples: m.samples.length,
          })),
        }),
      );
    } finally {
      await session.close();
    }
  }
} finally {
  await site.close();
}
