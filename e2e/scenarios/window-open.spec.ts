import { answerLeavePrompts, leavePrompts, warnBeforeUnload } from "../automation/leave-prompt";
import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

let site: Awaited<ReturnType<typeof startSite>>;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

test("a scripted product link opens once without taking its blocked-popup fallback", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  const cursor = await session.eventCursor();
  await parent.page.getByRole("link", { name: "Scripted product link" }).click();
  await session.waitForEvent("sub-tabs:opened", cursor);
  const child = await session.target(
    (t) => t.kind === "sub-tab" && t.url === `${site.url}/destination`,
  );
  await expect(parent.page).toHaveURL(`${site.url}/window-open`);
  await expect(parent.page.locator("#open-result")).toHaveText("opened");
  const destinations = (await session.targets()).filter((t) => t.url === `${site.url}/destination`);
  expect(destinations.map((t) => t.id)).toEqual([child.id]);
  expect((await session.capture("scripted-product-link")).status).toBe("complete");
});

test("a product link in a cross-origin panel keeps the host page and its opener", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open-panel`);
  const frame = parent.page.frameLocator('iframe[title="Product panel"]');
  const destination = `${site.url.replace("127.0.0.1", "localhost")}/destination`;
  await frame.getByRole("link", { name: "Scripted product link" }).click();
  const target = await session.target((t) => t.kind === "sub-tab" && t.url === destination);
  const child = await session.page(target);
  await expect(frame.locator("#open-result")).toHaveText("opened");
  await expect(parent.page).toHaveURL(`${site.url}/window-open-panel`);
  expect(await child.evaluate(() => window.opener !== null)).toBe(true);
  expect((await session.targets()).filter((t) => t.url === destination)).toHaveLength(1);
});

test("blank window handles support deferred navigation and script closing", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  await parent.page.getByRole("button", { name: "Open blank then navigate" }).click();
  const openedTarget = await session.target(
    (t) => t.kind === "sub-tab" && t.url === `${site.url}/deferred-destination`,
  );
  const openedPage = await session.page(openedTarget);
  await openedPage.evaluate(() => window.close());
  await expect
    .poll(async () => (await session.targets()).some((t) => t.id === openedTarget.id))
    .toBe(false);
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  await expect(frame.getByRole("button", { name: "Open as tab" })).toBeHidden();
  await expect
    .poll(() =>
      session.command("sub-tabs:get-stack", { parentTabId: openedTarget.parentId?.slice(4) }),
    )
    .toEqual([]);
  await expect(parent.page.locator("#open-result")).toHaveText("opened");
  await expect(parent.page).toHaveURL(`${site.url}/window-open`);
});

test("a child closing under an inactive parent restores input without stealing focus", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/inactive-parent`);
  const root = await session.target(
    (t) => t.kind === "tab" && t.url === `${site.url}/inactive-parent`,
  );
  await parent.subTab.click();
  const childTarget = await session.target(
    (t) => t.kind === "sub-tab" && t.url === `${site.url}/child`,
  );
  const child = await session.page(childTarget);
  const other = await VerificationPage.navigate(session, `${site.url}/other-parent`);
  const otherTarget = await session.target(
    (t) => t.kind === "tab" && t.url === `${site.url}/other-parent`,
  );
  await other.message.click();
  await expect
    .poll(async () => (await session.targets()).find((t) => t.id === otherTarget.id)?.focused)
    .toBe(true);

  await child.evaluate(() => window.close());
  await expect
    .poll(() => session.command("sub-tabs:get-stack", { parentTabId: root.tabId }))
    .toEqual([]);
  await expect
    .poll(async () => (await session.targets()).some((t) => t.id === childTarget.id))
    .toBe(false);
  expect((await session.targets()).find((t) => t.id === otherTarget.id)?.focused).toBe(true);
  await expect(other.message).toBeFocused();
  await other.message.pressSequentially("still focused");
  await expect(other.message).toHaveValue("still focused");

  await session.shell.locator(`[data-tab-id="${root.tabId}"]`).click();
  await parent.submit("parent input restored");
  await expect(parent.result).toHaveText("parent input restored");
  expect((await session.capture("inactive-parent-input-restored")).status).toBe("complete");
});

for (const button of ["left", "middle"] as const) {
  test(`a ${button} click on a noopener link opens one ${button === "left" ? "child" : "background"} tab`, async ({
    appSession: session,
  }) => {
    const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
    await parent.page.getByRole("link", { name: "Plain product link" }).click({ button });
    const target = await session.target(
      (t) =>
        t.kind === (button === "left" ? "sub-tab" : "tab") &&
        t.url === `${site.url}/plain-destination`,
    );
    const child = await session.page(target);
    expect(await child.evaluate(() => window.opener === null)).toBe(true);
    expect(
      (await session.targets())
        .filter((t) => t.url === `${site.url}/plain-destination`)
        .map((t) => t.id),
    ).toEqual([target.id]);
    await expect(parent.page).toHaveURL(`${site.url}/window-open`);
    if (button === "middle")
      expect((await session.targets()).find((t) => t.id === target.id)?.visible).toBe(false);
  });
}

test("a target-blank form preserves its POST body", async ({ appSession: session }) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  await parent.page.getByRole("button", { name: "Submit product form" }).click();
  const child = await session.page(
    await session.target((t) => t.kind === "sub-tab" && t.url === `${site.url}/posted-destination`),
  );
  await expect(child.locator("output")).toHaveText("product-form");
  await expect(parent.page).toHaveURL(`${site.url}/window-open`);
});

test("rapid product opens reconcile a redirect completed before queued adoption", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  const root = await session.target((t) => t.kind === "tab" && t.url === `${site.url}/window-open`);
  await parent.page.getByRole("button", { name: "Open two products" }).click();
  await expect
    .poll(() => session.command("sub-tabs:get-stack", { parentTabId: root.tabId }))
    .toMatchObject([
      {
        url: `${site.url}/first-destination`,
        title: "Verification /first-destination",
        loading: false,
      },
      {
        url: `${site.url}/final-destination`,
        title: "Verification /final-destination",
        loading: false,
      },
    ]);
  await expect(parent.page).toHaveURL(`${site.url}/window-open`);
});

test("a promoted script-opened child closes through its current tab owner", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  await parent.page.getByRole("button", { name: "Open blank then navigate" }).click();
  const target = await session.target(
    (t) => t.kind === "sub-tab" && t.url === `${site.url}/deferred-destination`,
  );
  const child = await session.page(target);
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  await frame.getByRole("button", { name: "Open as tab" }).click();
  await session.target((t) => t.kind === "tab" && t.tabId === target.tabId);
  await child.evaluate(() => window.close());
  await expect
    .poll(async () => (await session.targets()).some((t) => t.id === target.id))
    .toBe(false);
  await expect.poll(() => session.command("tabs:get", { tabId: target.tabId })).toBeUndefined();
});

test("nested opens from a pending child keep the regular parent and close with it", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  const root = await session.target((t) => t.kind === "tab" && t.url === `${site.url}/window-open`);
  await parent.page.getByRole("button", { name: "Open nested products" }).click();
  const nested = await session.target(
    (t) => t.kind === "sub-tab" && t.url === `${site.url}/nested-destination`,
  );
  expect(nested.parentId).toBe(root.id);
  await expect
    .poll(() => session.command("sub-tabs:get-stack", { parentTabId: root.tabId }))
    .toHaveLength(3);
  await session.command("tabs:close", { tabId: root.tabId });
  await expect
    .poll(async () => (await session.targets()).filter((t) => t.kind === "sub-tab"))
    .toEqual([]);
});

test("a script-closed child is removed while another page cancels quit", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/window-open`);
  const root = await session.target((t) => t.kind === "tab" && t.url === `${site.url}/window-open`);
  await parent.page.getByRole("button", { name: "Open blank then navigate" }).click();
  const child = await session.target(
    (t) => t.kind === "sub-tab" && t.url === `${site.url}/deferred-destination`,
  );
  const blocker = await VerificationPage.navigate(session, `${site.url}/quit-blocker`);
  await blocker.submit("unsaved changes");
  await warnBeforeUnload(blocker.page);
  await answerLeavePrompts(session.app, [false]);
  try {
    await session.app.evaluate(({ app, webContents }, childId) => {
      app.once("before-quit", () => {
        void webContents.fromId(childId)?.executeJavaScript("window.close()");
      });
      app.quit();
    }, child.webContentsId);
    await expect.poll(() => leavePrompts(session.app)).toHaveLength(1);
    await expect
      .poll(async () => (await session.targets()).some((t) => t.id === child.id))
      .toBe(false);
    await expect
      .poll(() => session.command("sub-tabs:get-stack", { parentTabId: root.tabId }))
      .toEqual([]);
    await expect(blocker.message).toHaveValue("unsaved changes");
  } finally {
    await answerLeavePrompts(session.app, [true]);
  }
});
