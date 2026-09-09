import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("Duplicate tab preserves history, session and zoom with independent lifecycle", async ({
  appSession: session,
}) => {
  test.setTimeout(60_000);
  const site = await startSite();
  const other = await startSite();
  try {
    const original = await VerificationPage.navigate(session, `${site.url}/first`);
    await original.page.goto(`${site.url}/second`);
    await original.page.goto(`${other.url}/third`);
    await original.page.goBack();
    await original.submit("live heap stays in source");
    const source = await session.target((t) => t.kind === "tab" && t.url === `${site.url}/second`);
    const history = (id: number) =>
      session.app.evaluate(({ webContents }, id) => {
        const wc = webContents.fromId(id);
        if (!wc) throw new Error("Missing tab");
        return {
          entries: wc.navigationHistory.getAllEntries().map((e) => e.url),
          index: wc.navigationHistory.getActiveIndex(),
        };
      }, id);
    await session.app.evaluate(async ({ webContents }, id) => {
      const wc = webContents.fromId(id);
      if (!wc) throw new Error("Missing source");
      wc.setZoomLevel(2);
      await wc.session.cookies.set({
        url: wc.getURL(),
        name: "duplicate-fixture",
        value: "shared",
      });
    }, source.webContentsId);
    const before = await history(source.webContentsId);
    // Native menus have no CDP target. Inspect the actual menu and invoke its item callback.
    await session.app.evaluate(({ Menu }) => {
      const original = Menu.prototype.popup;
      Menu.prototype.popup = function (options) {
        (globalThis as typeof globalThis & { verificationMenu?: Electron.Menu }).verificationMenu =
          this;
        Menu.prototype.popup = original;
        return original.call(this, options);
      };
    });
    await session.shell.locator(`[data-tab-id="${source.tabId}"]`).click({ button: "right" });
    await expect
      .poll(() =>
        session.app.evaluate(() => {
          const menu = (globalThis as typeof globalThis & { verificationMenu?: Electron.Menu })
            .verificationMenu;
          return menu?.items.some((item) => item.label === "Duplicate tab" && item.enabled);
        }),
      )
      .toBe(true);
    expect((await session.capture("duplicate-tab-menu")).status).toBe("complete");
    await session.app.evaluate(() => {
      const root = globalThis as typeof globalThis & { verificationMenu?: Electron.Menu };
      const menu = root.verificationMenu!;
      const item = menu.items.find((item) => item.label === "Duplicate tab")!;
      item.click();
      menu.closePopup();
      delete root.verificationMenu;
    });
    const clone = await session.target(
      (t) => t.kind === "tab" && t.tabId !== source.tabId && t.url === source.url,
    );
    const copy = new VerificationPage(await session.page(clone));
    await expect(copy.message).toBeVisible();
    expect(await history(clone.webContentsId)).toEqual(before);
    await expect(copy.result).toHaveText("");
    await expect(original.result).toHaveText("live heap stays in source");
    expect(
      await session.app.evaluate(
        ({ webContents }, { a, b }) => {
          const source = webContents.fromId(a)!;
          const clone = webContents.fromId(b)!;
          return {
            sameSession: source.session === clone.session,
            zoom: clone.getZoomLevel(),
            mode: clone.getZoomMode(),
          };
        },
        { a: source.webContentsId, b: clone.webContentsId },
      ),
    ).toEqual({ sameSession: true, zoom: 2, mode: "isolated" });
    expect(await copy.page.evaluate(() => document.cookie)).toContain("duplicate-fixture=shared");
    await copy.page.goForward();
    await expect(copy.page).toHaveURL(`${other.url}/third`);
    expect(await history(source.webContentsId)).toEqual(before);
    await copy.page.goBack();
    await copy.page.goBack();
    await expect(copy.page).toHaveURL(`${site.url}/first`);
    await session.command("zoom:in");
    expect(
      await session.app.evaluate(
        ({ webContents }, id) => webContents.fromId(id)?.getZoomLevel(),
        source.webContentsId,
      ),
    ).toBe(2);
    const disposable = await session.command<string>("tabs:duplicate", { tabId: source.tabId });
    await session.target((t) => t.kind === "tab" && t.tabId === disposable);
    await session.command("tabs:close", { tabId: disposable });
    expect(await history(source.webContentsId)).toEqual(before);
    await session.command("tabs:activate", { tabId: source.tabId });
    await original.message.fill("");
    await original.submit("source survives closing a copy");
    await expect(original.result).toHaveText("source survives closing a copy");
    await session.command("tabs:activate", { tabId: clone.tabId });
    await session.command("tabs:close", { tabId: source.tabId });
    await copy.submit("copy survives");
    await expect(copy.result).toHaveText("copy survives");
    await copy.subTab.click();
    await session.target((t) => t.kind === "sub-tab" && t.url.endsWith("/child"));
    const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
    const closed = await session.eventCursor();
    await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
    await session.waitForEvent("sub-tabs:closed", closed);
    expect((await session.capture("duplicate-tab")).status).toBe("complete");
  } finally {
    await Promise.all([site.close(), other.close()]);
  }
});

test("cloned tab views retain isolated sessions and web preferences", async ({
  appSession: session,
}) => {
  const { build } = await import("esbuild");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  // Exercise the same view factory with a non-default source session. Workspaces currently
  // control persistence, not Chromium partitions; this checks the native boundary explicitly.
  const filename = path.resolve("out/main/verify-tab-view.cjs");
  await build({
    entryPoints: ["src/platform/tab-view.ts"],
    outfile: filename,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  const site = await startSite();
  try {
    const result = await session.app.evaluate(
      async ({ session, WebContentsView }, { filename, url }) => {
        const { createTabView } = process.getBuiltinModule("module").createRequire(filename)(
          filename,
        ) as {
          createTabView(source: Electron.WebContents): Electron.WebContentsView;
        };
        const isolated = session.fromPartition(`duplicate-${crypto.randomUUID()}`);
        const source = new WebContentsView({
          webPreferences: {
            session: isolated,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
          },
        });
        let copy: Electron.WebContentsView | undefined;
        try {
          await isolated.cookies.set({ url, name: "isolated-duplicate", value: "private" });
          await source.webContents.loadURL(url);
          copy = createTabView(source.webContents);
          const loaded = new Promise<void>((resolve) =>
            copy!.webContents.once("did-finish-load", () => resolve()),
          );
          copy.webContents.reload();
          await loaded;
          return {
            sameSession: copy.webContents.session === isolated,
            differentFromDefault: copy.webContents.session !== session.defaultSession,
            copiedCookie: (
              await copy.webContents.session.cookies.get({ url, name: "isolated-duplicate" })
            ).length,
            defaultCookie: (
              await session.defaultSession.cookies.get({ url, name: "isolated-duplicate" })
            ).length,
            nodeAccess: await copy.webContents.executeJavaScript("typeof require"),
          };
        } finally {
          await copy?.webContents.close();
          await source.webContents.close();
        }
      },
      { filename, url: `${site.url}/isolated` },
    );
    expect(result).toMatchObject({
      sameSession: true,
      differentFromDefault: true,
      copiedCookie: 1,
      defaultCookie: 0,
      nodeAccess: "undefined",
    });
  } finally {
    await site.close();
    await fs.unlink(filename);
  }
});
