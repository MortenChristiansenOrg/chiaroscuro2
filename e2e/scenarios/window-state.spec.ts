import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../fixtures/electron-app";
import { WindowChromePage } from "../pages/window-chrome.page";

for (const mode of ["normal", "maximized", "fullscreen"] as const) {
  test(`native window state restores ${mode} after full restart`, async ({
    appSession: session,
  }) => {
    test.setTimeout(60_000);
    const bounds = { x: 140, y: 120, width: 1000, height: 700 };
    await session.app.evaluate(({ BrowserWindow }, bounds) => {
      const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
      if (!win) throw new Error("Missing shell");
      win.setBounds(bounds);
    }, bounds);
    await session.command("app-state:set-sidebar-width", { width: 310 });
    // Electron debounces saves for 200ms and batches preference writes. Observe
    // the actual native record before restart rather than racing app shutdown.
    const userData = await session.app.evaluate(({ app }) => app.getPath("userData"));
    const persisted = async () => {
      try {
        const prefs = JSON.parse(await fs.readFile(path.join(userData, "Local State"), "utf8"));
        return prefs.windowStates?.["main-window"];
      } catch {
        return undefined;
      }
    };
    await expect.poll(persisted, { timeout: 20_000 }).toMatchObject({
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
      maximized: false,
      fullscreen: false,
    });
    await session.restart();
    if (mode === "maximized") {
      await new WindowChromePage(session.shell).maximizeButton.click();
    } else if (mode === "fullscreen") {
      await session.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((win) => !win.getParentWindow())
          ?.setFullScreen(true);
      });
    }
    const readWindow = () =>
      session.app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
        if (!win) throw new Error("Missing shell");
        return {
          bounds: win.getNormalBounds(),
          maximized: win.isMaximized(),
          fullscreen: win.isFullScreen(),
        };
      });
    await expect.poll(readWindow).toMatchObject({
      maximized: mode === "maximized",
      fullscreen: mode === "fullscreen",
    });
    await expect.poll(persisted, { timeout: 20_000 }).toMatchObject({
      maximized: mode === "maximized",
      fullscreen: mode === "fullscreen",
    });
    const pid = session.app.process().pid;
    await session.restart();
    expect(session.app.process().pid).not.toBe(pid);
    await expect.poll(readWindow).toMatchObject({
      maximized: mode === "maximized",
      fullscreen: mode === "fullscreen",
    });
    if (mode !== "fullscreen") expect((await readWindow()).bounds).toEqual(bounds);
    await expect(session.shell.getByRole("separator")).toHaveAttribute("aria-valuenow", "310");
    const capture = await session.capture(`restored-${mode}`);
    expect(capture.status).toBe("complete");
  });
}

test("native restoration makes off-screen bounds reachable on the current display", async ({
  appSession: session,
}) => {
  test.setTimeout(60_000);
  await session.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((win) => !win.getParentWindow())
      ?.setBounds({ x: 10000, y: 10000, width: 1000, height: 700 });
  });
  await session.restart();
  const restored = await session.app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
    if (!win) throw new Error("Missing shell");
    const bounds = win.getBounds();
    return { bounds, area: screen.getDisplayMatching(bounds).workArea };
  });
  // Electron preserves partial off-screen positioning on an unchanged display,
  // while making at least 100 × 100 DIP reachable for recovery.
  const visibleWidth =
    Math.min(restored.bounds.x + restored.bounds.width, restored.area.x + restored.area.width) -
    Math.max(restored.bounds.x, restored.area.x);
  const visibleHeight =
    Math.min(restored.bounds.y + restored.bounds.height, restored.area.y + restored.area.height) -
    Math.max(restored.bounds.y, restored.area.y);
  expect(visibleWidth).toBeGreaterThanOrEqual(100);
  expect(visibleHeight).toBeGreaterThanOrEqual(100);
  expect((await session.capture("offscreen-restored")).status).toBe("complete");
});

for (const displayChange of ["removed-monitor", "smaller-work-area"] as const) {
  test(`native restoration fits a saved ${displayChange} layout`, async ({
    appSession: session,
  }) => {
    test.setTimeout(60_000);
    const userData = await session.app.evaluate(({ app }) => app.getPath("userData"));
    await session.stop();
    const preferencesPath = path.join(userData, "Local State");
    // Exercise a profile with no native preference file as well as an existing one.
    if (displayChange === "removed-monitor") await fs.rm(preferencesPath, { force: true });
    const preferences = JSON.parse(
      await fs.readFile(preferencesPath, "utf8").catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "{}";
        throw error;
      }),
    );
    preferences.windowStates ??= {};
    // Model a previous display configuration in this test's isolated profile.
    // This exercises Electron's restoration, not a physical hot-plug or DPI change.
    preferences.windowStates["main-window"] = {
      left: 2500,
      top: 200,
      right: 4500,
      bottom: 1400,
      workAreaLeft: displayChange === "removed-monitor" ? 1920 : 0,
      workAreaTop: 0,
      workAreaRight: displayChange === "removed-monitor" ? 5760 : 3840,
      workAreaBottom: 2160,
      maximized: false,
      fullscreen: false,
      kiosk: false,
    };
    await fs.writeFile(preferencesPath, JSON.stringify(preferences));
    await session.launch();
    const { bounds, area } = await session.app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
      if (!win) throw new Error("Missing shell");
      const bounds = win.getBounds();
      return { bounds, area: screen.getDisplayMatching(bounds).workArea };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(area.x);
    expect(bounds.y).toBeGreaterThanOrEqual(area.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height);
    expect((await session.capture(displayChange)).status).toBe("complete");
  });
}
