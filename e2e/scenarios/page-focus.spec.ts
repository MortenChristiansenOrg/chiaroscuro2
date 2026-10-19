import type { AppSession } from "../automation/session";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { windowsInput } from "../automation/windows-input";
import { windowsPointer } from "../automation/windows-pointer";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

/** The contents that keyboard input from the OS would reach. */
const focusedContents = (session: AppSession) =>
  session.app.evaluate(({ webContents }) => webContents.getFocusedWebContents()?.id ?? null);

/** Type through whichever contents the OS input would reach. */
const typeKeys = (session: AppSession, keys: string[]) =>
  session.app.evaluate(({ webContents }, keys) => {
    const focused = webContents.getFocusedWebContents();
    if (!focused) throw new Error("No focused contents");
    for (const key of keys) {
      focused.sendInputEvent({ type: "keyDown", keyCode: key });
      if (key.length === 1) focused.sendInputEvent({ type: "char", keyCode: key });
      focused.sendInputEvent({ type: "keyUp", keyCode: key });
    }
  }, keys);

/** Open the fixture page that opens a sub-tab. */
async function openParent(session: AppSession, siteUrl: string) {
  const parentUrl = `${siteUrl}/parent`;
  const parent = await VerificationPage.navigate(session, parentUrl);
  const parentTab = await session.target(
    (target) => target.kind === "tab" && target.url === parentUrl,
  );
  return { parent, parentTab };
}

async function subTabPage(session: AppSession, siteUrl: string) {
  const target = await session.target(
    (target) => target.kind === "sub-tab" && target.url === `${siteUrl}/child` && target.visible,
  );
  return { child: new VerificationPage(await session.page(target)), childTab: target };
}

const subTabClosed = (session: AppSession) =>
  waitUntil(
    "sub-tab removal",
    () => session.targets(),
    (targets) => !targets.some((target) => target.kind === "sub-tab"),
  );

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

// #124: the sub-tab window could not take keyboard focus, so typing into a sub-tab page did nothing.
test("typing reaches a page opened as a sub-tab, and the page underneath once it closes", async ({
  appSession: session,
}) => {
  test.skip(session.headless, "Window activation needs a desktop window manager");
  const site = await startSite();
  try {
    const { parent, parentTab } = await openParent(session, site.url);
    await parent.subTab.click();
    const { child, childTab } = await subTabPage(session, site.url);
    // The opened page takes keyboard focus, as a page opened in a new tab would.
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    await child.message.click();
    await typeKeys(session, ["h", "i"]);
    await expect(child.message).toHaveValue("hi");

    // Switching back activates the sub-tab window; its page, not the backdrop, gets focus back.
    const focusedAfterReturn = await session.app.evaluate(
      async ({ BrowserWindow, webContents }, childContentsId) => {
        const until = async (condition: () => boolean, what: string) => {
          const deadline = Date.now() + 5_000;
          while (!condition()) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        };
        const subTabWindow = BrowserWindow.getAllWindows().find((win) =>
          win.contentView.children.some(
            (view) => (view as Electron.WebContentsView).webContents?.id === childContentsId,
          ),
        );
        if (!subTabWindow) throw new Error("No sub-tab window");
        const other = new BrowserWindow({ width: 320, height: 200, show: false });
        try {
          await other.loadURL("data:text/html,<input autofocus aria-label=Other>");
          other.show();
          other.focus();
          await until(() => other.isFocused(), "the other window to be active");
          // Windows activates the window that was active last, here the sub-tab window.
          subTabWindow.focus();
          await until(() => subTabWindow.isFocused(), "the sub-tab window to be active again");
          await new Promise((resolve) => setTimeout(resolve, 500));
          return webContents.getFocusedWebContents()?.id ?? null;
        } finally {
          other.destroy();
        }
      },
      childTab.webContentsId,
    );
    expect(focusedAfterReturn).toBe(childTab.webContentsId);
    await typeKeys(session, ["!"]);
    await expect(child.message).toHaveValue("hi!");

    // Escape still closes the sub-tab, and keyboard focus returns to the parent page.
    await typeKeys(session, ["Escape"]);
    await subTabClosed(session);
    await expect.poll(() => focusedContents(session)).toBe(parentTab.webContentsId);
    // Moving the page's own focus does not move native focus; typing proves the page has it.
    await parent.message.focus();
    await typeKeys(session, ["o", "k"]);
    await expect(parent.message).toHaveValue("ok");
  } finally {
    await site.close();
  }
});

test("Windows desktop clicks and typing reach a page opened as a sub-tab", async ({
  appSession: session,
}) => {
  test.skip(process.platform !== "win32", "Requires Windows desktop input");
  test.setTimeout(120_000);
  const site = await startSite();
  try {
    const { parent, parentTab } = await openParent(session, site.url);
    // Bring the browser to the foreground without clicking into it.
    await windowsPointer(session, { x: 4, y: 400 });
    await windowsInput(session, {
      click: { webContentsId: parentTab.webContentsId, locator: parent.subTab },
    });
    const { child, childTab } = await subTabPage(session, site.url);
    // Activate the browser window, so that the click into the page has to activate the sub-tab.
    await windowsPointer(session, { x: 4, y: 400 });
    await expect.poll(() => focusedContents(session)).not.toBe(childTab.webContentsId);
    await windowsInput(session, {
      click: { webContentsId: childTab.webContentsId, locator: child.message },
    });
    await expect(child.message).toBeFocused();
    await windowsInput(session, { keys: "hi" });
    await expect(child.message).toHaveValue("hi");

    await windowsInput(session, { keys: "{ESC}" });
    await subTabClosed(session);
    await expect.poll(() => focusedContents(session)).toBe(parentTab.webContentsId);
    await windowsInput(session, {
      click: { webContentsId: parentTab.webContentsId, locator: parent.message },
    });
    await windowsInput(session, { keys: "ok" });
    await expect(parent.message).toHaveValue("ok");
  } finally {
    await site.close();
  }
});
