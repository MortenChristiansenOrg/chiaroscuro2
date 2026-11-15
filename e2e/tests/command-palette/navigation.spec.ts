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

  test("clicking the address edits it in the current tab", async ({
    commandPalettePage,
    sidebarPage,
    windowChromePage,
  }) => {
    const address = windowChromePage.addressButton;
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();
    await expect(address).toHaveText("example.com", { timeout: 5_000 });
    const count = await sidebarPage.getTabCount();

    // The palette opens on the current address, all of it selected.
    await commandPalettePage.openByClicking(address);
    const input = commandPalettePage.input;
    await expect(input).toHaveValue(/^https:\/\/example\.com\/?$/);
    await expect(input).toBeFocused();
    await expect
      .poll(() =>
        input.evaluate(
          (el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length,
        ),
      )
      .toBe(true);
    await expect(commandPalettePage.page.locator("#hints")).toHaveText("Enter = go · Esc = cancel");

    // Escape leaves the tab as it was.
    await commandPalettePage.page.keyboard.press("Escape");
    await expect(commandPalettePage.overlay).toBeHidden({ timeout: 3_000 });
    await expect(address).toHaveText("example.com");

    // Going to the current address does nothing.
    await commandPalettePage.openByClicking(address);
    await commandPalettePage.search("example.com");
    await commandPalettePage.submit();
    await expect(commandPalettePage.overlay).toBeHidden({ timeout: 3_000 });
    await expect(address).toHaveText("example.com");
    expect(await sidebarPage.getTabCount()).toBe(count);

    // A new address replaces the current tab's address.
    await commandPalettePage.openByClicking(address);
    await commandPalettePage.search("https://example.org/edited");
    await commandPalettePage.submit();
    await expect(commandPalettePage.overlay).toBeHidden({ timeout: 3_000 });
    await expect(address).toHaveText("example.org/edited", { timeout: 5_000 });
    expect(await sidebarPage.getTabCount()).toBe(count);

    // Opening the palette normally still opens a new tab.
    await commandPalettePage.open();
    await expect(commandPalettePage.input).toHaveValue("");
    await expect(commandPalettePage.page.locator("#hints")).toContainText("Enter = new tab");
    await commandPalettePage.close();
  });
});
