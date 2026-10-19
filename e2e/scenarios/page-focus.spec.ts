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
    // Click the browser window, so that the click into the page has to activate the sub-tab.
    const shell = await session.target((target) => target.kind === "shell");
    await windowsInput(session, {
      click: {
        webContentsId: shell.webContentsId,
        locator: session.shell.locator(
          `nav[aria-label='Sidebar'] [data-tab-id="${parentTab.tabId}"]`,
        ),
      },
    });
    await expect.poll(() => focusedContents(session)).toBe(shell.webContentsId);
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

/** Open a window that stands in for another application and give it the foreground. */
const activateOtherWindow = (session: AppSession) =>
  session.app.evaluate(async ({ BrowserWindow, screen }) => {
    // Away from the browser window's sidebar, which the tests point at.
    const area = screen.getPrimaryDisplay().workArea;
    const other = new BrowserWindow({
      x: area.x + area.width - 340,
      y: area.y + area.height - 220,
      width: 320,
      height: 200,
      show: false,
    });
    await other.loadURL("data:text/html,<input autofocus aria-label=Other>");
    other.show();
    other.focus();
    const deadline = Date.now() + 5_000;
    while (!other.isFocused()) {
      if (Date.now() > deadline) throw new Error("Timed out waiting for the other window");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // Keep it until the test closes it: closing it would activate the browser window.
    const keep = globalThis as unknown as { otherWindows?: Electron.BrowserWindow[] };
    keep.otherWindows = [...(keep.otherWindows ?? []), other];
  });

const closeOtherWindows = (session: AppSession) =>
  session.app.evaluate(() => {
    const keep = globalThis as unknown as { otherWindows?: Electron.BrowserWindow[] };
    for (const win of keep.otherWindows ?? []) if (!win.isDestroyed()) win.destroy();
    keep.otherWindows = [];
  });

/** Activate the browser window as the app itself or another program would, without a click. */
const activateBrowserWindow = (session: AppSession) =>
  session.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (win) => !win.getParentWindow() && win.webContents.getURL().includes("/out/renderer/"),
    );
    if (!main) throw new Error("No browser window");
    main.focus();
  });

// #131: activating the browser window with the pointer over it left typing in the browser UI.
test("activating the browser window without a click returns typing to the sub-tab page", async ({
  appSession: session,
}) => {
  test.skip(session.headless, "Window activation needs a desktop window manager");
  const site = await startSite();
  try {
    const { parent } = await openParent(session, site.url);
    await parent.subTab.click();
    const { child, childTab } = await subTabPage(session, site.url);
    await child.message.click();
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);

    await activateOtherWindow(session);
    await activateBrowserWindow(session);
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    await typeKeys(session, ["o", "k"]);
    await expect(child.message).toHaveValue("ok");
  } finally {
    await closeOtherWindows(session);
    await site.close();
  }
});

// #131: outside Windows, the press of a click that activates the window can arrive after the
// window's focus event. Windows reports clicks with the activation, so it needs desktop input.
test("a click that activates the browser window keeps focus in the browser UI", async ({
  appSession: session,
}) => {
  test.skip(session.headless, "Window activation needs a desktop window manager");
  test.skip(process.platform === "win32", "Windows clicks need desktop input; see below");
  const site = await startSite();
  try {
    const { parent, parentTab } = await openParent(session, site.url);
    await parent.subTab.click();
    const { child, childTab } = await subTabPage(session, site.url);
    await child.message.click();
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    const shell = await session.target((target) => target.kind === "shell");
    const sidebarTab = session.shell.locator(
      `nav[aria-label='Sidebar'] [data-tab-id="${parentTab.tabId}"]`,
    );
    const box = await sidebarTab.boundingBox();
    if (!box) throw new Error("Sidebar tab has no geometry");

    await activateOtherWindow(session);
    // As a window manager does for a click: activate the window, then deliver the press.
    await session.app.evaluate(
      ({ BrowserWindow, webContents }, { shellId, x, y }) => {
        const shell = webContents.fromId(shellId);
        const main = shell && BrowserWindow.fromWebContents(shell);
        if (!shell || !main) throw new Error("No browser window");
        main.focus();
        setTimeout(() => {
          shell.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
          shell.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
        }, 20);
      },
      {
        shellId: shell.webContentsId,
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      },
    );
    await expect.poll(() => focusedContents(session)).toBe(shell.webContentsId);
    // Long enough for a forwarded activation to have moved focus.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await focusedContents(session)).toBe(shell.webContentsId);
  } finally {
    await closeOtherWindows(session);
    await site.close();
  }
});

test("Windows: activations without a click return typing to the sub-tab page, clicks do not", async ({
  appSession: session,
}) => {
  test.skip(process.platform !== "win32", "Requires Windows desktop input");
  test.setTimeout(120_000);
  const site = await startSite();
  try {
    const { parent, parentTab } = await openParent(session, site.url);
    await windowsPointer(session, { x: 4, y: 400 });
    await windowsInput(session, {
      click: { webContentsId: parentTab.webContentsId, locator: parent.subTab },
    });
    const { child, childTab } = await subTabPage(session, site.url);
    await windowsInput(session, {
      click: { webContentsId: childTab.webContentsId, locator: child.message },
    });
    await windowsInput(session, { keys: "a" });
    await expect(child.message).toHaveValue("a");
    const shell = await session.target((target) => target.kind === "shell");
    const sidebar = {
      webContentsId: shell.webContentsId,
      locator: session.shell.locator(
        `nav[aria-label='Sidebar'] [data-tab-id="${parentTab.tabId}"]`,
      ),
    };

    // The app activates the browser window while the pointer rests over its sidebar.
    await activateOtherWindow(session);
    await windowsInput(session, { hover: sidebar });
    await activateBrowserWindow(session);
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    await windowsInput(session, { keys: "b" });
    await expect(child.message).toHaveValue("ab");

    // Another program activates it, with the pointer over the browser window.
    await activateOtherWindow(session);
    await windowsPointer(session, { x: 4, y: 400 }, false, false);
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    await windowsInput(session, { keys: "c" });
    await expect(child.message).toHaveValue("abc");

    // A click on the sidebar of the inactive browser window keeps the focus it gives.
    await activateOtherWindow(session);
    await windowsInput(session, { click: sidebar });
    await expect.poll(() => focusedContents(session)).toBe(shell.webContentsId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await focusedContents(session)).toBe(shell.webContentsId);

    // So does a click on the sidebar while typing in the sub-tab page.
    await windowsInput(session, {
      click: { webContentsId: childTab.webContentsId, locator: child.message },
    });
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    await windowsInput(session, { click: sidebar });
    await expect.poll(() => focusedContents(session)).toBe(shell.webContentsId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await focusedContents(session)).toBe(shell.webContentsId);
    await expect(child.message).toHaveValue("abc");
  } finally {
    await closeOtherWindows(session);
    await site.close();
  }
});
