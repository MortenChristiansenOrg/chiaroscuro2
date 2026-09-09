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
    // Establish the normal state before a separate display-mode transition.
    // Electron debounces geometry saves, so an immediate programmatic maximize
    // after setBounds would otherwise retain the previous normal bounds.
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

test("native restoration fits off-screen bounds to the current display", async ({
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
  expect(restored.bounds.x).toBeGreaterThanOrEqual(restored.area.x);
  expect(restored.bounds.y).toBeGreaterThanOrEqual(restored.area.y);
  expect(restored.bounds.x + restored.bounds.width).toBeLessThanOrEqual(
    restored.area.x + restored.area.width,
  );
  expect(restored.bounds.y + restored.bounds.height).toBeLessThanOrEqual(
    restored.area.y + restored.area.height,
  );
  expect((await session.capture("offscreen-restored")).status).toBe("complete");
});
