import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { answerLeavePrompts, leavePrompts, warnBeforeUnload } from "../automation/leave-prompt";
import { AppSession } from "../automation/session";
import { waitUntil } from "../automation/wait";

type Chrome = {
  runtime: { getURL(path: string): string };
  windows: {
    create(data: unknown): Promise<{ id: number }>;
    getCurrent(): Promise<{ id: number; type: string }>;
    remove(id: number): Promise<void>;
  };
};

// Regression for #113: Bitwarden's pop-out window could not be closed.
test("an extension pop-out window closes natively and from inside, confirming unsaved changes", async ({
  playwright: _playwright,
}, testInfo) => {
  test.setTimeout(60_000);
  const app = new AppSession(testInfo.outputPath("app"), [], true);
  const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const popoutWindows = () =>
    app.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((win) => win.webContents.getURL().includes("uilocation=popout"))
        .map((win) => ({ id: win.id, menuBar: win.isMenuBarVisible() })),
    );
  const openPopout = async (): Promise<Page> => {
    const toggle = app.shell.getByRole("button", { name: "Extensions", exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await app.shell.getByRole("button", { name: "Compatibility fixture", exact: true }).click();
    const popup = await app.page(
      await app.target(
        (target) =>
          target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
      ),
    );
    // The same call Bitwarden's "Pop out" button makes. The focused window closes the popup.
    await popup
      .evaluate(() => {
        const api = (globalThis as unknown as { chrome: Chrome }).chrome;
        return api.windows.create({
          type: "popup",
          focused: true,
          width: 480,
          height: 630,
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
    if (!popout) throw new Error("No pop-out page");
    await popout.waitForLoadState();
    return popout;
  };
  const unsaved = async (popout: Page) => {
    // Chromium only honours beforeunload after the user has interacted with the page.
    await popout.getByRole("button", { name: "Unlock and fill fixture" }).click();
    await warnBeforeUnload(popout);
  };
  const closeNatively = (id: number) =>
    app.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), id);
  const closed = () =>
    waitUntil("pop-out window closed", popoutWindows, (windows) => windows.length === 0, 5_000);

  try {
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

    let popout = await openPopout();
    const [native] = await popoutWindows();
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
    expect(await popoutWindows()).toHaveLength(1);
    // Leaving closes it.
    await answerLeavePrompts(app.app, [true]);
    await closeNatively(native.id);
    await closed();
    expect(await leavePrompts(app.app)).toEqual([prompt]);

    // Bitwarden's own close: windows.remove((await windows.getCurrent()).id).
    popout = await openPopout();
    await popout
      .evaluate(async () => {
        const api = (globalThis as unknown as { chrome: Chrome }).chrome;
        await api.windows.remove((await api.windows.getCurrent()).id);
      })
      .catch(() => {});
    await closed();
  } finally {
    await app.close();
  }
});
