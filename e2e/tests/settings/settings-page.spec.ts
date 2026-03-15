import { expect, test } from "../../fixtures/test";

/** Open settings via command palette — waits for suggestion then submits. */
async function openSettings(
  commandPalettePage: InstanceType<
    typeof import("../../pages/command-palette.page").CommandPalettePage
  >,
) {
  await commandPalettePage.open();
  await commandPalettePage.search("/settings");
  await expect(async () => {
    const count = await commandPalettePage.getSuggestionCount();
    expect(count).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 3_000 });
  await commandPalettePage.submit();
}

test.describe("settings page", () => {
  test("opens settings via /settings in command palette", async ({
    commandPalettePage,
    settingsPage,
  }) => {
    await openSettings(commandPalettePage);

    // Settings page should render in main content area
    await settingsPage.waitForVisible();
  });

  test("settings page renders with search providers section", async ({
    commandPalettePage,
    settingsPage,
  }) => {
    await openSettings(commandPalettePage);

    await settingsPage.waitForVisible();

    // Should have default search providers
    const count = await settingsPage.getProviderCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("add and remove search provider", async ({ commandPalettePage, settingsPage }) => {
    await openSettings(commandPalettePage);

    await settingsPage.waitForVisible();

    const countBefore = await settingsPage.getProviderCount();

    // Add a provider
    await settingsPage.addProvider();
    await expect(async () => {
      expect(await settingsPage.getProviderCount()).toBe(countBefore + 1);
    }).toPass({ timeout: 3_000 });

    // Remove the last provider
    await settingsPage.removeProvider(countBefore); // 0-indexed, so countBefore is the new one
    await expect(async () => {
      expect(await settingsPage.getProviderCount()).toBe(countBefore);
    }).toPass({ timeout: 3_000 });
  });
});
