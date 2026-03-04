import { expect, test } from "../../fixtures/test";

test.describe("command palette navigation", () => {
  test("opens via Ctrl+T with input focused", async ({ commandPalettePage, electronApp }) => {
    test.setTimeout(10_000);
    await commandPalettePage.openViaKeyboard(electronApp);
    await expect(commandPalettePage.overlay).toBeVisible();
    await expect(commandPalettePage.input).toBeFocused();
  });

  test("Escape closes the palette", async ({ commandPalettePage }) => {
    await commandPalettePage.open();
    await expect(commandPalettePage.overlay).toBeVisible();

    await commandPalettePage.page.keyboard.press("Escape");
    await expect(commandPalettePage.overlay).toBeHidden({ timeout: 3_000 });
  });

  test("typing URL shows Navigate to resolution", async ({ commandPalettePage }) => {
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");

    const text = await commandPalettePage.getResolutionText();
    expect(text).toContain("Navigate to");
  });

  test("typing search query shows Search with resolution", async ({ commandPalettePage }) => {
    await commandPalettePage.open();
    await commandPalettePage.search("cats and dogs");

    const text = await commandPalettePage.getResolutionText();
    expect(text).toContain("Search with");
  });

  test("Enter creates a new tab", async ({ commandPalettePage, sidebarPage }) => {
    const before = await sidebarPage.getTabCount();

    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(before + 1);
    }).toPass({ timeout: 5_000 });
  });

  test("Ctrl+Enter navigates in current tab", async ({ commandPalettePage, sidebarPage }) => {
    // Create a tab first
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    const countBefore = await sidebarPage.getTabCount();

    // Navigate in current tab — should NOT create a new tab
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.org");
    await commandPalettePage.submitInCurrentTab();

    // Verify palette closes (navigation happened) then check tab count
    await expect(commandPalettePage.overlay).toBeHidden({ timeout: 3_000 });
    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(countBefore);
    }).toPass({ timeout: 2_000 });
  });

  test("bang syntax resolves provider", async ({ commandPalettePage }) => {
    await commandPalettePage.open();
    await commandPalettePage.search("!g cats");

    const text = await commandPalettePage.getResolutionText();
    expect(text).toContain("Search with");
    expect(text).toContain("Google");
  });

  test("/settings shows built-in page suggestion", async ({ commandPalettePage }) => {
    await commandPalettePage.open();
    await commandPalettePage.search("/settings");

    // Built-in pages shown after debounce — poll for suggestion count
    await expect(async () => {
      const count = await commandPalettePage.getSuggestionCount();
      expect(count).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 3_000 });
  });
});
