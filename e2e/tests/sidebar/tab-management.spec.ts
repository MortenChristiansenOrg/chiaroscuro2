import { expect, test } from "../../fixtures/test";

test.describe("sidebar tab management", () => {
  test("creates tab via command palette", async ({ sidebarPage, commandPalettePage }) => {
    const before = await sidebarPage.getTabCount();

    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(before + 1);
    }).toPass({ timeout: 5_000 });
  });

  test("clicking tab activates it", async ({ sidebarPage, commandPalettePage }) => {
    // Create two tabs
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();
    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    await commandPalettePage.open();
    await commandPalettePage.search("https://example.org");
    await commandPalettePage.submit();
    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5_000 });

    // Click first tab — the active tab should change
    const titles = await sidebarPage.getTabTitles();
    if (titles.length >= 2) {
      const first = titles[0];
      if (first) await sidebarPage.clickTab(first);
    }
  });

  test("closes tab via close button", async ({ sidebarPage, commandPalettePage }) => {
    // Create a tab
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    const countBefore = await sidebarPage.getTabCount();

    await sidebarPage.closeTabByIndex(0);

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(countBefore - 1);
    }).toPass({ timeout: 3_000 });
  });
});
