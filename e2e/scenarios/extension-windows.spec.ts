import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { answerLeavePrompts, leavePrompts, warnBeforeUnload } from "../automation/leave-prompt";
import { AppSession } from "../automation/session";
import { waitUntil } from "../automation/wait";

type Tab = { id: number; windowId: number; url: string };
type Chrome = {
  runtime: { getURL(path: string): string };
  tabs: {
    query(info: unknown): Promise<Tab[]>;
    getCurrent(): Promise<Tab | undefined>;
    remove(id: number): Promise<void>;
  };
  windows: {
    create(data: unknown): Promise<{ id: number }>;
    getCurrent(): Promise<{ id: number; type: string }>;
    update(id: number, data: unknown): Promise<unknown>;
    remove(id: number): Promise<void>;
  };
};
const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Launch with the fixture extension installed. */
async function launch(app: AppSession) {
  app.profile = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-verify-extension-windows-"));
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
  // Bitwarden positions its pop-out relative to the current browser window.
  await app.command("tabs:create", { url: "about:blank" });
}

const popoutWindows = (app: AppSession) =>
  app.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((win) => win.webContents.getURL().includes("uilocation=popout"))
      .map((win) => ({ id: win.id, menuBar: win.isMenuBarVisible() })),
  );

const closed = (app: AppSession) =>
  waitUntil(
    "pop-out window closed",
    () => popoutWindows(app),
    (windows) => windows.length === 0,
    5_000,
  );

/** Open the fixture's action popup, and from it a pop-out window with the same call Bitwarden makes. */
async function openPopout(app: AppSession, search = "?uilocation=popout") {
  const toggle = app.shell.getByRole("button", { name: "Extensions", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await app.shell.getByRole("button", { name: "Compatibility fixture", exact: true }).click();
  const popup = await app.page(
    await app.target(
      (target) => target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
    ),
  );
  // The focused window closes the popup.
  await popup
    .evaluate((search) => {
      const api = (globalThis as unknown as { chrome: Chrome }).chrome;
      return api.windows.create({
        type: "popup",
        focused: true,
        width: 480,
        height: 630,
        url: api.runtime.getURL(`popup.html${search}`),
      });
    }, search)
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
  if (!popout) throw new Error("No pop-out page");
  await popout.waitForLoadState();
  return popout;
}

// Regression for #113: Bitwarden's pop-out window could not be closed.
test("an extension pop-out window closes natively and from inside, confirming unsaved changes", async ({
  playwright: _playwright,
}, testInfo) => {
  test.setTimeout(60_000);
  const app = new AppSession(testInfo.outputPath("app"), [], true);
  const unsaved = async (popout: Page) => {
    // Chromium only honours beforeunload after the user has interacted with the page.
    await popout.getByRole("button", { name: "Unlock and fill fixture" }).click();
    await warnBeforeUnload(popout);
  };
  const closeNatively = (id: number) =>
    app.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), id);

  try {
    await launch(app);
    let popout = await openPopout(app);
    const [native] = await popoutWindows(app);
    if (!native) throw new Error("No pop-out window");
    // The browser's accelerator menu belongs to the main window.
    expect(native.menuBar).toBe(false);
    const current = await popout.evaluate(() =>
      (globalThis as unknown as { chrome: Chrome }).chrome.windows.getCurrent(),
    );
    expect(current).toMatchObject({ id: native.id, type: "popup" });

    // Title-bar close with unsaved changes: staying keeps the window.
    await unsaved(popout);
    const prompt = { title: "Compatibility fixture", message: "Leave this page?" };
    await answerLeavePrompts(app.app, [false]);
    await closeNatively(native.id);
    await expect.poll(() => leavePrompts(app.app)).toEqual([prompt]);
    expect(await popoutWindows(app)).toHaveLength(1);
    // Leaving closes it.
    await answerLeavePrompts(app.app, [true]);
    await closeNatively(native.id);
    await closed(app);
    expect(await leavePrompts(app.app)).toEqual([prompt]);

    // Bitwarden's own close: windows.remove((await windows.getCurrent()).id).
    popout = await openPopout(app);
    await popout
      .evaluate(async () => {
        const api = (globalThis as unknown as { chrome: Chrome }).chrome;
        await api.windows.remove((await api.windows.getCurrent()).id);
      })
      .catch(() => {});
    await closed(app);
  } finally {
    await app.close();
  }
});

// Regression for #116: Bitwarden finds its single-action pop-outs with tabs.query by URL,
// then focuses or closes them through the tab.
test("an extension pop-out window has one tab its extension can find, focus and close", async ({
  playwright: _playwright,
}, testInfo) => {
  test.setTimeout(60_000);
  const app = new AppSession(testInfo.outputPath("app"), [], true);
  const query = (page: Page) =>
    page.evaluate(() => {
      const api = (globalThis as unknown as { chrome: Chrome }).chrome;
      return api.tabs.query({ url: `${api.runtime.getURL("popup.html")}*` });
    });
  try {
    await launch(app);
    const popout = await openPopout(app, "?uilocation=popout&singleActionPopout=add");
    const [native] = await popoutWindows(app);
    if (!native) throw new Error("No pop-out window");
    const tabs = await query(popout);
    expect(tabs).toEqual([
      expect.objectContaining({
        windowId: native.id,
        url: expect.stringContaining("singleActionPopout=add"),
      }),
    ]);
    const [tab] = tabs;
    if (!tab) throw new Error("No pop-out tab");
    expect(
      await popout.evaluate(() =>
        (globalThis as unknown as { chrome: Chrome }).chrome.tabs.getCurrent(),
      ),
    ).toEqual(tab);

    // Opening it again focuses the existing window instead of a duplicate.
    // WSLg does not report native focus reliably, so record the focus request instead.
    await app.app.evaluate(({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id);
      if (!win) return;
      const record = globalThis as unknown as { popoutFocus: number };
      record.popoutFocus = 0;
      const focus = win.focus.bind(win);
      win.focus = () => {
        record.popoutFocus++;
        focus();
      };
    }, native.id);
    await popout.evaluate(
      (windowId) =>
        (globalThis as unknown as { chrome: Chrome }).chrome.windows.update(windowId, {
          focused: true,
          width: 520,
          height: 640,
        }),
      tab.windowId,
    );
    expect(await popoutWindows(app)).toHaveLength(1);
    expect(
      await app.app.evaluate(({ BrowserWindow }, id) => {
        const win = BrowserWindow.fromId(id);
        return {
          focus: (globalThis as unknown as { popoutFocus: number }).popoutFocus,
          size: win?.getSize(),
        };
      }, native.id),
    ).toEqual({ focus: 1, size: [520, 640] });

    // Cancel closes it through the tab's window, as Bitwarden's closeSingleActionPopout does.
    await popout
      .evaluate(async () => {
        const api = (globalThis as unknown as { chrome: Chrome }).chrome;
        const tabs = await api.tabs.query({ url: `${api.runtime.getURL("popup.html")}*` });
        for (const tab of tabs) await api.windows.remove(tab.windowId);
      })
      .catch(() => {});
    await closed(app);

    // Closing its tab closes the window too.
    const reopened = await openPopout(app, "?uilocation=popout&singleActionPopout=add");
    await reopened
      .evaluate(async () => {
        const api = (globalThis as unknown as { chrome: Chrome }).chrome;
        const tab = await api.tabs.getCurrent();
        if (tab) await api.tabs.remove(tab.id);
      })
      .catch(() => {});
    await closed(app);
  } finally {
    await app.close();
  }
});
