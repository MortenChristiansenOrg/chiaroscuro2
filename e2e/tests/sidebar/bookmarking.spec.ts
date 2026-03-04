import { expect, test } from "../../fixtures/test";

/** Create a tab and return its tab ID. */
async function createTab(
  sidebarPage: InstanceType<typeof import("../../pages/sidebar.page").SidebarPage>,
  commandPalettePage: InstanceType<
    typeof import("../../pages/command-palette.page").CommandPalettePage
  >,
  url: string,
): Promise<string> {
  const idsBefore = await sidebarPage.getTabIds();
  await commandPalettePage.open();
  await commandPalettePage.search(url);
  await commandPalettePage.submit();

  let newId = "";
  await expect(async () => {
    const ids = await sidebarPage.getTabIds();
    const added = ids.filter((id) => !idsBefore.includes(id));
    expect(added.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    newId = added[0]!;
  }).toPass({ timeout: 5_000 });
  return newId;
}

test.describe("bookmarking", () => {
  test("bookmark ephemeral tab moves to bookmarked section", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);

    // Tab should start as ephemeral (muted text)
    expect(await sidebarPage.isTabEphemeral(tabId)).toBe(true);

    // Bookmark it
    await sidebarPage.bookmarkActiveTab();

    // Should no longer be ephemeral
    await expect(async () => {
      expect(await sidebarPage.isTabEphemeral(tabId)).toBe(false);
    }).toPass({ timeout: 5_000 });
  });

  test("unbookmark returns tab to ephemeral section", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);

    // Bookmark then unbookmark
    await sidebarPage.bookmarkActiveTab();
    await expect(async () => {
      expect(await sidebarPage.isTabEphemeral(tabId)).toBe(false);
    }).toPass({ timeout: 2_000 });
    await sidebarPage.bookmarkActiveTab();

    await expect(async () => {
      expect(await sidebarPage.isTabEphemeral(tabId)).toBe(true);
    }).toPass({ timeout: 5_000 });
  });

  test("bookmarked tabs use non-muted text styling", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const ephemeralId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    const bookmarkedId = await createTab(sidebarPage, commandPalettePage, "https://example.org");

    // Bookmark the second tab
    await sidebarPage.activateTabById(bookmarkedId);
    await sidebarPage.waitForActiveTab(bookmarkedId);
    await sidebarPage.bookmarkActiveTab();

    // Ephemeral tab should have muted styling
    expect(await sidebarPage.isTabEphemeral(ephemeralId)).toBe(true);

    // Bookmarked tab should have non-muted styling
    await expect(async () => {
      expect(await sidebarPage.isTabEphemeral(bookmarkedId)).toBe(false);
    }).toPass({ timeout: 5_000 });
  });
});
