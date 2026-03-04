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

test.describe("pinned tabs", () => {
  test("pin tab removes from tab list and appears in pinned strip", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);

    const tabCountBefore = await sidebarPage.getTabCount();
    const pinnedBefore = await sidebarPage.getPinnedTabCount();

    await sidebarPage.pinActiveTab();

    await expect(async () => {
      expect(await sidebarPage.getPinnedTabCount()).toBe(pinnedBefore + 1);
      expect(await sidebarPage.getTabCount()).toBe(tabCountBefore - 1);
    }).toPass({ timeout: 5_000 });
  });

  test("clicking pinned tab activates it", async ({ sidebarPage, commandPalettePage }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);
    await sidebarPage.pinActiveTab();

    await expect(async () => {
      expect(await sidebarPage.getPinnedTabIds()).toContain(tabId);
    }).toPass({ timeout: 5_000 });

    // Create another tab to deactivate the pinned one
    await createTab(sidebarPage, commandPalettePage, "https://example.org");

    // Click the pinned tab
    await sidebarPage.clickPinnedTab(tabId);

    // Verify activation via the store
    await expect(async () => {
      const activeId = await sidebarPage.page.evaluate(
        () =>
          // @ts-expect-error accessing internal store
          window.__tabsStore?.getState().activeTabId,
      );
      // If store not accessible, just verify the pinned tab button has active styling
      if (!activeId) {
        const btn = sidebarPage.sidebar.locator(`[data-pinned-tab="${tabId}"]`);
        const cls = await btn.getAttribute("class");
        expect(cls).toContain("bg-glass-active");
      } else {
        expect(activeId).toBe(tabId);
      }
    }).toPass({ timeout: 3_000 });
  });

  test("unpin returns tab to normal list", async ({ sidebarPage, commandPalettePage }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);
    await sidebarPage.pinActiveTab();

    await expect(async () => {
      expect(await sidebarPage.getPinnedTabIds()).toContain(tabId);
    }).toPass({ timeout: 5_000 });

    // Unpin (toggle again — need to activate first)
    await sidebarPage.clickPinnedTab(tabId);
    await sidebarPage.pinActiveTab();

    await expect(async () => {
      expect(await sidebarPage.getPinnedTabIds()).not.toContain(tabId);
      expect(await sidebarPage.getTabIds()).toContain(tabId);
    }).toPass({ timeout: 5_000 });
  });

  test("pinned tabs visible across workspace switch", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);
    await sidebarPage.pinActiveTab();

    await expect(async () => {
      expect(await sidebarPage.getPinnedTabIds()).toContain(tabId);
    }).toPass({ timeout: 5_000 });

    // Create and switch to new workspace
    await sidebarPage.openAddWorkspace();
    await sidebarPage.submitWorkspaceForm("PinTest WS");

    await expect(async () => {
      expect(await sidebarPage.getWorkspaceNames()).toContain("PinTest WS");
    }).toPass({ timeout: 3_000 });

    await sidebarPage.switchWorkspace("PinTest WS");

    // Pinned tab should still be visible
    await expect(async () => {
      expect(await sidebarPage.getPinnedTabIds()).toContain(tabId);
    }).toPass({ timeout: 3_000 });
  });

  test("pinned strip uses data-pinned-tab attribute", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabId = await createTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.activateTabById(tabId);
    await sidebarPage.waitForActiveTab(tabId);
    await sidebarPage.pinActiveTab();

    await expect(async () => {
      const el = sidebarPage.sidebar.locator(`[data-pinned-tab="${tabId}"]`);
      await expect(el).toBeAttached();
    }).toPass({ timeout: 5_000 });
  });
});
