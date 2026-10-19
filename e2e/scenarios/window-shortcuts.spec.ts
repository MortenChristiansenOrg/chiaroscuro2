import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test as base } from "@playwright/test";
import { AppSession } from "../automation/session";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { windowsInput } from "../automation/windows-input";
import { windowsPointer } from "../automation/windows-pointer";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

/** The contents that keyboard input from the OS would reach. */
const focusedContents = (session: AppSession) =>
  session.app.evaluate(({ webContents }) => webContents.getFocusedWebContents()?.id ?? null);

/** Press a key, with modifiers, in whichever contents the OS input would reach. */
const press = (session: AppSession, keyCode: string, modifiers: ("control" | "shift")[] = []) =>
  session.app.evaluate(
    ({ webContents }, { keyCode, modifiers }) => {
      const focused = webContents.getFocusedWebContents();
      if (!focused) throw new Error("No focused contents");
      focused.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      if (keyCode.length === 1 && !modifiers.length) {
        focused.sendInputEvent({ type: "char", keyCode, modifiers });
      }
      focused.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    },
    { keyCode, modifiers },
  );

const tabCount = async (session: AppSession) =>
  (await session.targets()).filter((target) => target.kind === "tab").length;

/** The palette window stays shown while closed; its backdrop shows whether it is open. */
const paletteOpen = (session: AppSession) =>
  session.app.evaluate(async ({ BrowserWindow }) => {
    const palette = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("chiaroscuro-cmd-palette"),
    );
    return (
      !!palette?.isVisible() &&
      (await palette.webContents.executeJavaScript(
        "document.getElementById('backdrop').classList.contains('open')",
      ))
    );
  });

async function openSubTab(session: AppSession, siteUrl: string) {
  const parentUrl = `${siteUrl}/parent`;
  const parent = await VerificationPage.navigate(session, parentUrl);
  const parentTab = await session.target(
    (target) => target.kind === "tab" && target.url === parentUrl,
  );
  return { parent, parentTab };
}

async function subTabPage(session: AppSession, siteUrl: string) {
  const childTab = await session.target(
    (target) => target.kind === "sub-tab" && target.url === `${siteUrl}/child` && target.visible,
  );
  return { child: new VerificationPage(await session.page(childTab)), childTab };
}

const hasSubTab = async (session: AppSession) =>
  (await session.targets()).some((target) => target.kind === "sub-tab");

/** Sub-tab close commands sent since the history cursor. */
const subTabCloses = async (session: AppSession, after: number) =>
  (
    await session.debug<{ entries: { id: number }[] }>(
      "/history?type=command&limit=1000&name=sub-tabs%3Aclose",
    )
  ).entries.filter((entry) => entry.id > after).length;

// #130: the sub-tab's Escape shortcut also ran for the Escape that closed the palette.
test("Escape in the command palette over a sub-tab closes only the palette", async ({
  appSession: session,
}) => {
  test.skip(session.headless, "Window activation needs a desktop window manager");
  const site = await startSite();
  try {
    const { parent } = await openSubTab(session, site.url);
    await parent.subTab.click();
    const { child, childTab } = await subTabPage(session, site.url);
    await child.message.click();
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);

    // The sub-tab closed most of the time, but not always.
    const cursor = await session.eventCursor();
    for (let attempt = 0; attempt < 3; attempt++) {
      await press(session, "T", ["control"]);
      await waitUntil(
        "palette to open",
        () => paletteOpen(session),
        (open) => open,
      );
      const palette = await session.target((target) => target.kind === "palette");
      await expect.poll(() => focusedContents(session)).toBe(palette.webContentsId);
      await press(session, "Escape");
      await waitUntil(
        "palette to close",
        () => paletteOpen(session),
        (open) => !open,
      );
      // Typing continues in the sub-tab page.
      await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
      expect(await subTabCloses(session, cursor)).toBe(0);
    }
    await press(session, "o");
    await press(session, "k");
    await expect(child.message).toHaveValue("ok");
    expect(await hasSubTab(session)).toBe(true);

    // Escape in the sub-tab page itself still closes the sub-tab.
    await press(session, "Escape");
    await waitUntil(
      "sub-tab removal",
      () => hasSubTab(session),
      (open) => !open,
    );
  } finally {
    await site.close();
  }
});

// #115: browser shortcuts acted on the browser window while a website's popup had focus.
test("browser shortcuts stay with the browser window, and Ctrl+W closes a website popup", async ({
  appSession: session,
}) => {
  test.skip(session.headless, "Window activation needs a desktop window manager");
  const site = await startSite();
  try {
    const parentUrl = `${site.url}/parent`;
    const parent = await VerificationPage.navigate(session, parentUrl);
    const tabs = await tabCount(session);
    await parent.popup.click();
    const popup = await session.target(
      (target) => target.kind === "window" && target.url === `${site.url}/popup`,
    );
    await expect.poll(() => focusedContents(session)).toBe(popup.webContentsId);
    // The popup has no menu bar holding the browser's shortcuts.
    expect(
      await session.app.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.isMenuBarVisible(),
        popup.windowId ?? -1,
      ),
    ).toBe(false);

    // Browser shortcuts do nothing in the popup, and on Windows they must not activate the browser.
    await press(session, "T", ["control"]);
    expect(await focusedContents(session)).toBe(popup.webContentsId);
    await press(session, "W", ["control"]);
    await waitUntil(
      "popup to close",
      () => session.targets(),
      (targets) => !targets.some((target) => target.id === popup.id),
    );
    expect(await paletteOpen(session)).toBe(false);
    expect(await tabCount(session)).toBe(tabs);
    await session.target((target) => target.kind === "tab" && target.url === parentUrl);
  } finally {
    await site.close();
  }
});

type Chrome = {
  runtime: { getURL(path: string): string };
  windows: { create(data: unknown): Promise<{ id: number }> };
};

// #115: Ctrl+W in Bitwarden's pop-out closed the browser's active tab instead of the pop-out.
base(
  "Ctrl+W closes an extension's pop-out window, not a browser tab",
  async ({ playwright: _playwright }, testInfo) => {
    base.setTimeout(60_000);
    const app = new AppSession(testInfo.outputPath("app"), [], true);
    const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const popoutWindows = () =>
      app.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((win) => win.webContents.getURL().includes("uilocation=popout"))
          .map((win) => win.id),
      );
    try {
      app.profile = await fs.mkdtemp(
        path.join(os.tmpdir(), "chiaroscuro-verify-window-shortcuts-"),
      );
      await fs.cp(
        path.resolve("e2e/fixtures/extension"),
        path.join(app.profile, "chromium/extensions", extensionId),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(app.profile, "settings.json"),
        JSON.stringify({
          extensions: [
            {
              id: extensionId,
              name: "Compatibility fixture",
              version: "1.0.0",
              enabled: true,
              permissions: ["storage", "tabs", "scripting", "webNavigation", "http://127.0.0.1/*"],
            },
          ],
        }),
      );
      await app.launch();
      await app.command("tabs:create", { url: "about:blank" });
      const tabs = await tabCount(app);

      // Open the pop-out as Bitwarden's "Pop out" button does.
      const toggle = app.shell.getByRole("button", { name: "Extensions", exact: true });
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await app.shell.getByRole("button", { name: "Compatibility fixture", exact: true }).click();
      const popup = await app.page(
        await app.target(
          (target) =>
            target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
        ),
      );
      await popup
        .evaluate(() => {
          const api = (globalThis as unknown as { chrome: Chrome }).chrome;
          return api.windows.create({
            type: "popup",
            focused: true,
            url: api.runtime.getURL("popup.html?uilocation=popout"),
          });
        })
        .catch(() => {});
      const popout = await waitUntil(
        "pop-out page",
        async () =>
          app.app
            .context()
            .pages()
            .find((page) => page.url().includes("uilocation=popout")),
        (page) => !!page,
        5_000,
      );
      await popout?.waitForLoadState();
      const [popoutId] = await popoutWindows();
      if (popoutId === undefined) throw new Error("No pop-out window");
      const popoutContents = await app.app.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.webContents.id ?? null,
        popoutId,
      );
      await expect.poll(() => focusedContents(app)).toBe(popoutContents);

      await press(app, "T", ["control"]);
      expect(await focusedContents(app)).toBe(popoutContents);
      await press(app, "W", ["control"]);
      await waitUntil("pop-out window closed", popoutWindows, (windows) => windows.length === 0);
      expect(await paletteOpen(app)).toBe(false);
      expect(await tabCount(app)).toBe(tabs);
    } finally {
      await app.close();
    }
  },
);

/** The browser window's native state. */
const browserWindowState = (session: AppSession) =>
  session.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
    if (!main) throw new Error("No browser window");
    return { maximized: main.isMaximized(), minimized: main.isMinimized() };
  });

// #129: the sub-tab window cannot be maximized or minimized on its own, so Windows ignored
// Win+Up and Win+Down while typing in a sub-tab page. #130 and #115 with desktop keys.
test("Windows desktop keys in a sub-tab and a popup act on the right window", async ({
  appSession: session,
}) => {
  test.skip(process.platform !== "win32", "Requires Windows desktop input");
  test.setTimeout(120_000);
  const site = await startSite();
  try {
    const { parent, parentTab } = await openSubTab(session, site.url);
    await session.app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
      if (main?.isMaximized()) main.unmaximize();
    });
    await windowsPointer(session, { x: 4, y: 400 });
    await windowsInput(session, {
      click: { webContentsId: parentTab.webContentsId, locator: parent.subTab },
    });
    const { child, childTab } = await subTabPage(session, site.url);
    await windowsInput(session, {
      click: { webContentsId: childTab.webContentsId, locator: child.message },
    });
    await expect(child.message).toBeFocused();

    // The palette's Escape closes only the palette, and typing continues in the sub-tab page.
    await windowsInput(session, { keys: "^t" });
    await expect.poll(() => paletteOpen(session)).toBe(true);
    await windowsInput(session, { keys: "{ESC}" });
    await expect.poll(() => paletteOpen(session)).toBe(false);
    await expect.poll(() => focusedContents(session)).toBe(childTab.webContentsId);
    await windowsInput(session, { keys: "a" });
    await expect(child.message).toHaveValue("a");
    expect(await hasSubTab(session)).toBe(true);

    // Win+Up maximizes the browser window and Win+Down restores it. Typing stays in the page.
    await windowsInput(session, { windowsArrows: ["Up"] });
    await expect
      .poll(() => browserWindowState(session))
      .toEqual({
        maximized: true,
        minimized: false,
      });
    await windowsInput(session, { keys: "b" });
    await expect(child.message).toHaveValue("ab");
    await windowsInput(session, { windowsArrows: ["Down"] });
    await expect
      .poll(() => browserWindowState(session))
      .toEqual({
        maximized: false,
        minimized: false,
      });
    await windowsInput(session, { keys: "c" });
    await expect(child.message).toHaveValue("abc");
    // Win+Down again minimizes it. Restoring it returns typing to the sub-tab page.
    await windowsInput(session, { windowsArrows: ["Down"] });
    await expect
      .poll(() => browserWindowState(session))
      .toEqual({
        maximized: false,
        minimized: true,
      });
    await session.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((win) => !win.getParentWindow())
        ?.restore();
    });
    // Restoring from the taskbar returns focus to the sub-tab page (page-focus.spec.ts). Here the
    // pointer is over the window, which keeps the focus a click would give (#131).
    await windowsInput(session, {
      click: { webContentsId: childTab.webContentsId, locator: child.message },
    });
    await windowsInput(session, { keys: "{END}d" });
    await expect(child.message).toHaveValue("abcd");

    // Ctrl+W in a website popup closes the popup, not a browser tab or the sub-tab.
    await windowsInput(session, { keys: "{ESC}" });
    await waitUntil(
      "sub-tab removal",
      () => hasSubTab(session),
      (open) => !open,
    );
    const tabs = await tabCount(session);
    await windowsInput(session, {
      click: { webContentsId: parentTab.webContentsId, locator: parent.popup },
    });
    const popup = await session.target(
      (target) => target.kind === "window" && target.url === `${site.url}/popup`,
    );
    await expect.poll(() => focusedContents(session)).toBe(popup.webContentsId);
    await windowsInput(session, { keys: "^w" });
    await waitUntil(
      "popup to close",
      () => session.targets(),
      (targets) => !targets.some((target) => target.id === popup.id),
    );
    expect(await tabCount(session)).toBe(tabs);
  } finally {
    await site.close();
  }
});
