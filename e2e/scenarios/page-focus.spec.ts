import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

// #114: Electron focuses the shell whenever the browser window is activated, so a page
// input that still looked focused after switching back to the browser ignored typing.
test("a focused page input receives typing after switching to another window and back", async ({
  appSession: session,
}) => {
  test.skip(session.headless, "Window activation needs a desktop window manager");
  const site = await startSite();
  try {
    const url = `${site.url}/`;
    const verification = await VerificationPage.navigate(session, url);
    const tab = await session.target((target) => target.kind === "tab" && target.url === url);
    await verification.message.click();
    await expect(verification.message).toBeFocused();

    const focusedAfterReturn = await session.app.evaluate(
      async ({ BrowserWindow, webContents }, tabContentsId) => {
        const until = async (condition: () => boolean, what: string) => {
          const deadline = Date.now() + 5_000;
          while (!condition()) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        };
        const main = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
        if (!main) throw new Error("No browser window");
        webContents.fromId(tabContentsId)?.focus();
        await until(() => webContents.fromId(tabContentsId)?.isFocused() === true, "page focus");
        // Stands in for another application taking the foreground.
        const other = new BrowserWindow({ width: 320, height: 200, show: false });
        try {
          await other.loadURL("data:text/html,<input autofocus aria-label=Other>");
          other.show();
          other.focus();
          await until(() => other.isFocused(), "the other window to be active");
          main.focus();
          await until(() => main.isFocused(), "the browser window to be active again");
          // Report where keyboard input goes once activation has settled.
          await new Promise((resolve) => setTimeout(resolve, 500));
          return webContents.getFocusedWebContents()?.id ?? null;
        } finally {
          other.destroy();
        }
      },
      tab.webContentsId,
    );
    expect(focusedAfterReturn).toBe(tab.webContentsId);

    // Type through whichever contents the OS input would reach.
    await session.app.evaluate(({ webContents }) => {
      const focused = webContents.getFocusedWebContents();
      if (!focused) throw new Error("No focused contents");
      for (const key of ["h", "i"]) {
        focused.sendInputEvent({ type: "keyDown", keyCode: key });
        focused.sendInputEvent({ type: "char", keyCode: key });
        focused.sendInputEvent({ type: "keyUp", keyCode: key });
      }
    });
    await expect(verification.message).toHaveValue("hi");
  } finally {
    await site.close();
  }
});
