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
