import type { ElectronApplication, Page } from "playwright";
import type { AppSession } from "../automation/session";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

let site: Awaited<ReturnType<typeof startSite>>;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

const readWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
    if (!win) throw new Error("Missing shell");
    return {
      bounds: win.getBounds(),
      content: win.getContentBounds(),
      fullscreen: win.isFullScreen(),
      maximized: win.isMaximized(),
    };
  });

const enterFullScreen = (page: Page) =>
  page.evaluate(() => document.documentElement.requestFullscreen());

// Pages otherwise wait for the permission prompt, which is not what these scenarios cover.
test.beforeEach(async ({ appSession: session }) => {
  await session.command("permissions:set-global", { permission: "fullscreen", decision: "allow" });
});

const visibleTab = (session: AppSession, kind: "tab" | "sub-tab") =>
  session.target((target) => target.kind === kind && target.visible);

async function expectPageCoversWindow(session: AppSession, kind: "tab" | "sub-tab") {
  await waitUntil(
    "page covers the window",
    async () => ({ win: await readWindow(session.app), tab: await visibleTab(session, kind) }),
    ({ win, tab }) =>
      win.fullscreen &&
      tab.bounds?.x === 0 &&
      tab.bounds?.y === 0 &&
      tab.bounds?.width === win.content.width &&
      tab.bounds?.height === win.content.height,
  );
}

async function pressEscape(session: AppSession, webContentsId: number | undefined) {
  await session.app.evaluate(({ webContents }, id) => {
    const contents = webContents.fromId(id as number);
    contents?.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    contents?.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  }, webContentsId);
}

for (const mode of ["normal", "maximized"] as const) {
  test(`a full screen page hides the chrome and returns a ${mode} window as it was`, async ({
    appSession: session,
  }) => {
    const { page } = await VerificationPage.navigate(session, `${site.url}/parent`);
    if (mode === "maximized") {
      await session.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((win) => !win.getParentWindow())
          ?.maximize();
      });
      await expect.poll(async () => (await readWindow(session.app)).maximized).toBe(true);
    }
    await page.waitForTimeout(500);
    const before = await readWindow(session.app);
    const tabBefore = await visibleTab(session, "tab");

    await enterFullScreen(page);
    await expectPageCoversWindow(session, "tab");
    expect((await session.capture(`full-screen-${mode}`)).status).not.toBe("failed");

    await pressEscape(session, tabBefore.webContentsId);
    await expect.poll(() => readWindow(session.app)).toEqual(before);
    await expect
      .poll(async () => (await visibleTab(session, "tab")).bounds)
      .toEqual(tabBefore.bounds);
  });
}

test("switching tabs and closing a tab leave full screen", async ({ appSession: session }) => {
  const first = await VerificationPage.navigate(session, `${site.url}/parent`);
  const firstTab = await visibleTab(session, "tab");
  const second = await VerificationPage.navigate(session, `${site.url}/parent?second`);
  const secondTab = await visibleTab(session, "tab");
  await second.page.waitForTimeout(500);
  const before = await readWindow(session.app);

  await enterFullScreen(second.page);
  await expectPageCoversWindow(session, "tab");
  await session.command("tabs:activate", { tabId: firstTab.tabId });
  await expect.poll(() => readWindow(session.app)).toEqual(before);
  await expect
    .poll(() => second.page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  expect((await visibleTab(session, "tab")).id).toBe(firstTab.id);

  await enterFullScreen(first.page);
  await expectPageCoversWindow(session, "tab");
  await session.command("tabs:close", { tabId: firstTab.tabId });
  await expect.poll(() => readWindow(session.app)).toEqual(before);
  await expect.poll(async () => (await visibleTab(session, "tab")).id).toBe(secondTab.id);
});

test("leaving full screen doesn't run a page's replacement for exitFullscreen", async ({
  appSession: session,
}) => {
  const { page } = await VerificationPage.navigate(session, `${site.url}/parent`);
  await page.evaluate(() => {
    document.exitFullscreen = async () => {
      (window as unknown as { replaced: boolean }).replaced = true;
    };
  });
  await enterFullScreen(page);
  await expectPageCoversWindow(session, "tab");
  await session.command("tabs:create", { url: `${site.url}/parent?other` });
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { replaced?: boolean }).replaced)).toBe(
    undefined,
  );
});

test("a full screen sub-tab covers the window and returns to its frame", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const opened = await visibleTab(session, "sub-tab");
  const childPage = await session.page(opened);
  // The sub-tab opens with an animation; compare with where it comes to rest.
  await childPage.waitForTimeout(800);
  const child = await visibleTab(session, "sub-tab");
  const frameBefore = await session.target((target) => target.kind === "sub-tab-frame");
  const before = await readWindow(session.app);

  await enterFullScreen(childPage);
  await expectPageCoversWindow(session, "sub-tab");
  await waitUntil(
    "sub-tab window covers the browser window",
    async () => ({
      frame: await session.target((target) => target.kind === "sub-tab-frame"),
      win: await readWindow(session.app),
    }),
    ({ frame, win }) => JSON.stringify(frame.bounds) === JSON.stringify(win.content),
  );
  expect((await session.capture("full-screen-sub-tab")).status).not.toBe("failed");

  await pressEscape(session, child.webContentsId);
  await expect.poll(() => readWindow(session.app)).toEqual(before);
  await expect
    .poll(async () => (await visibleTab(session, "sub-tab")).bounds)
    .toEqual(child.bounds);
  // Compare sizes: WSLg doesn't report a child window's position until it has moved.
  await expect
    .poll(async () => {
      const { bounds } = await session.target((target) => target.kind === "sub-tab-frame");
      return { width: bounds?.width, height: bounds?.height };
    })
    .toEqual({ width: frameBefore.bounds?.width, height: frameBefore.bounds?.height });
});

test("a page under an open sub-tab can't enter full screen", async ({ appSession: session }) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const child = await visibleTab(session, "sub-tab");
  await parent.page.waitForTimeout(800);
  const before = await readWindow(session.app);

  await enterFullScreen(parent.page).catch(() => {});
  await expect
    .poll(() => parent.page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect.poll(() => readWindow(session.app)).toEqual(before);
  expect((await visibleTab(session, "sub-tab")).id).toBe(child.id);
});

test("opening a sub-tab leaves full screen", async ({ appSession: session }) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.page.waitForTimeout(500);
  const before = await readWindow(session.app);

  await enterFullScreen(parent.page);
  await expectPageCoversWindow(session, "tab");
  await parent.subTab.click();
  await visibleTab(session, "sub-tab");
  await expect
    .poll(() => parent.page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect.poll(() => readWindow(session.app)).toEqual(before);
});

test("a restart does not return to page full screen", async ({ appSession: session }) => {
  const { page } = await VerificationPage.navigate(session, `${site.url}/parent`);
  await enterFullScreen(page);
  await expectPageCoversWindow(session, "tab");
  await session.restart();
  await expect.poll(async () => (await readWindow(session.app)).fullscreen).toBe(false);
});
