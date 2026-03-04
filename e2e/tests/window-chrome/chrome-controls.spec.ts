import { expect, test } from "../../fixtures/test";

test.describe("window chrome controls", () => {
  test("title bar is visible", async ({ windowChromePage }) => {
    await expect(windowChromePage.titleBar).toBeVisible();
  });

  test("navigation buttons are visible", async ({ windowChromePage }) => {
    await expect(windowChromePage.backButton).toBeVisible();
    await expect(windowChromePage.forwardButton).toBeVisible();
    await expect(windowChromePage.reloadButton).toBeVisible();
  });

  test("window control buttons are present", async ({ windowChromePage }) => {
    await expect(windowChromePage.minimizeButton).toBeVisible();
    await expect(windowChromePage.maximizeButton).toBeVisible();
    await expect(windowChromePage.closeButton).toBeVisible();
  });

  test("address bar hidden when no active tab", async ({ windowChromePage }) => {
    // Fresh app has no tabs — URL pill should not be visible
    const url = await windowChromePage.getDisplayUrl();
    expect(url).toBeNull();
  });

  test("address bar shows URL of active tab", async ({
    windowChromePage,
    commandPalettePage,
    sidebarPage,
  }) => {
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    // Wait for URL to update in title bar
    await expect(async () => {
      const url = await windowChromePage.getDisplayUrl();
      expect(url).toContain("example.com");
    }).toPass({ timeout: 5_000 });
  });

  test("copy URL button changes to Copied!", async ({
    windowChromePage,
    commandPalettePage,
    sidebarPage,
  }) => {
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    // Wait for copy button to appear
    await expect(windowChromePage.copyUrlButton).toBeVisible({ timeout: 5_000 });

    await windowChromePage.clickCopyUrl();

    // After click, aria-label changes to "Copied!"
    const copiedButton = windowChromePage.page.locator("button[aria-label='Copied!']");
    await expect(copiedButton).toBeVisible({ timeout: 3_000 });
  });
});
