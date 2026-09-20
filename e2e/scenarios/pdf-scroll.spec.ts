import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("PDF scroll position survives switching workspace tabs", async ({ appSession: session }) => {
  const site = await startSite();
  try {
    await VerificationPage.navigate(session, `${site.url}/other-tab`);
    const webTab = await session.target((target) => target.kind === "tab" && target.visible);
    const first = await session.command<string>("tabs:create", {
      url: `/pdf-reader?url=${encodeURIComponent(`${site.url}/sample.pdf?document=first`)}`,
    });
    await expect(session.shell.locator("canvas").first()).toBeVisible();
    await session.shell.getByRole("button", { name: "Zoom in", exact: true }).click();
    const zoom = session.shell.getByRole("button", { name: "Reset zoom", exact: true });
    await expect(zoom).toHaveText("125%");
    const viewport = session.shell.locator("canvas").first().locator("../../../..");
    await viewport.hover();
    await session.shell.mouse.wheel(0, 180);
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    const firstPosition = await viewport.evaluate((el) => el.scrollTop);

    await session.shell.locator(`[data-tab-id="${webTab.tabId}"]`).click();
    await expect(session.shell.locator("canvas")).toHaveCount(0);
    await session.shell.locator(`[data-tab-id="${first}"]`).click();
    await expect(session.shell.locator("canvas").first()).toBeVisible();
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeCloseTo(firstPosition, 0);
    await expect(zoom).toHaveText("125%");

    const second = await session.command<string>("tabs:create", {
      url: `/pdf-reader?url=${encodeURIComponent(`${site.url}/sample.pdf?document=second`)}`,
    });
    await expect(session.shell.locator("canvas").first()).toBeVisible();
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
    await zoom.click();
    await expect(zoom).toHaveText("100%");
    await viewport.hover();
    await session.shell.mouse.wheel(0, 50);
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    const secondPosition = await viewport.evaluate((el) => el.scrollTop);
    for (let i = 0; i < 2; i++) {
      await session.shell.locator(`[data-tab-id="${first}"]`).click();
      await expect
        .poll(() => viewport.evaluate((el) => el.scrollTop))
        .toBeCloseTo(firstPosition, 0);
      await expect(zoom).toHaveText("125%");
      await session.shell.locator(`[data-tab-id="${second}"]`).click();
      await expect
        .poll(() => viewport.evaluate((el) => el.scrollTop))
        .toBeCloseTo(secondPosition, 0);
      await expect(zoom).toHaveText("100%");
    }
    expect((await session.capture("pdf-scroll-restored")).status).toBe("complete");
  } finally {
    await site.close();
  }
});
