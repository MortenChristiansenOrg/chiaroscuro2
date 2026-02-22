import { expect, test } from "../../fixtures/test";
import type { CommandPalettePage } from "../../pages/command-palette.page";
import type { SidebarPage } from "../../pages/sidebar.page";

// ── Helpers ───────────────────────────────────────────────────────

/** Create a tab via URL, bookmark it, return its data-tab-id. */
async function createBookmarkedTab(
  sidebarPage: SidebarPage,
  commandPalettePage: CommandPalettePage,
  url: string,
): Promise<string> {
  const idsBefore = await sidebarPage.getTabIds();
  await commandPalettePage.open();
  await commandPalettePage.search(url);
  await commandPalettePage.submit();

  // Wait for tab to appear
  let newId = "";
  await expect(async () => {
    const ids = await sidebarPage.getTabIds();
    const added = ids.filter((id) => !idsBefore.includes(id));
    expect(added.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    newId = added[0]!;
  }).toPass({ timeout: 5_000 });

  // Bookmark the newly created (ephemeral) tab
  await sidebarPage.activateTabById(newId);
  await sidebarPage.page.waitForTimeout(200);
  await sidebarPage.bookmarkActiveTab();
  await sidebarPage.page.waitForTimeout(300);
  return newId;
}

/** Create a folder from the active (bookmarked) tab and rename it. */
async function createNamedFolder(sidebarPage: SidebarPage, name: string) {
  const before = await sidebarPage.getFolderCount();
  await sidebarPage.createFolder();
  await expect(async () => {
    expect(await sidebarPage.getFolderCount()).toBe(before + 1);
  }).toPass({ timeout: 3_000 });
  await sidebarPage.submitFolderRename(name);
  await sidebarPage.page.waitForTimeout(200);
}

// ── Folder creation ──────────────────────────────────────────────

test.describe("folder creation", () => {
  test("creates folder for active bookmarked tab", async ({ sidebarPage, commandPalettePage }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    expect(await sidebarPage.getFolderCount()).toBe(0);

    await sidebarPage.createFolder();

    await expect(async () => {
      expect(await sidebarPage.getFolderCount()).toBe(1);
    }).toPass({ timeout: 3_000 });
  });

  test("new folder starts with rename input focused", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await sidebarPage.createFolder();

    await expect(async () => {
      expect(await sidebarPage.getFolderCount()).toBe(1);
    }).toPass({ timeout: 3_000 });

    const input = sidebarPage.folderList.locator("input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("toggle removes tab from folder", async ({ sidebarPage, commandPalettePage }) => {
    const tabA = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    const tabB = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.org");

    // Create folder with tab A
    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Test Folder");

    // Drag tab B into folder
    await sidebarPage.dragTabByIndexToFolder(1, "Test Folder");
    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("Test Folder")).toBe(2);
    }).toPass({ timeout: 3_000 });

    // Toggle removes active tab (tab A) from folder
    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await sidebarPage.createFolder(); // toggles off

    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("Test Folder")).toBe(1);
    }).toPass({ timeout: 3_000 });
  });
});

// ── Folder rename ────────────────────────────────────────────────

test.describe("folder rename", () => {
  test("double-click to rename folder", async ({ sidebarPage, commandPalettePage }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await createNamedFolder(sidebarPage, "My Folder");

    await expect(async () => {
      expect(await sidebarPage.getFolderNames()).toContain("My Folder");
    }).toPass({ timeout: 3_000 });

    await sidebarPage.renameFolder("My Folder", "Renamed Folder");

    await expect(async () => {
      expect(await sidebarPage.getFolderNames()).toContain("Renamed Folder");
    }).toPass({ timeout: 3_000 });
  });

  test("Escape cancels rename without changing name", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await createNamedFolder(sidebarPage, "Original");

    // Get folder ID for reliable targeting after double-click
    const folder = sidebarPage.folder("Original");
    const folderId = await folder.getAttribute("data-folder-id");
    const folderHeader = folder.locator("span").first();
    await folderHeader.dblclick();

    const folderById = sidebarPage.sidebar.locator(`[data-folder-id="${folderId}"]`);
    const input = folderById.locator("input");
    await input.fill("Changed");
    await input.press("Escape");

    await expect(async () => {
      expect(await sidebarPage.getFolderNames()).toContain("Original");
    }).toPass({ timeout: 3_000 });
  });
});

// ── Folder collapse/expand ───────────────────────────────────────

test.describe("folder collapse and expand", () => {
  test("clicking folder header collapses and hides children", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await createNamedFolder(sidebarPage, "Collapsible");

    expect(await sidebarPage.isFolderCollapsed("Collapsible")).toBe(false);

    await sidebarPage.toggleFolderCollapse("Collapsible");
    await expect(async () => {
      expect(await sidebarPage.isFolderCollapsed("Collapsible")).toBe(true);
    }).toPass({ timeout: 3_000 });

    await sidebarPage.toggleFolderCollapse("Collapsible");
    await expect(async () => {
      expect(await sidebarPage.isFolderCollapsed("Collapsible")).toBe(false);
    }).toPass({ timeout: 3_000 });
  });
});

// ── Folder deletion ──────────────────────────────────────────────

test.describe("folder deletion", () => {
  test("removing folder promotes contained tabs to root", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await createNamedFolder(sidebarPage, "ToDelete");

    const tabsBefore = await sidebarPage.getTabCount();
    await sidebarPage.removeFolder("ToDelete");

    await expect(async () => {
      expect(await sidebarPage.getFolderCount()).toBe(0);
    }).toPass({ timeout: 3_000 });

    expect(await sidebarPage.getTabCount()).toBe(tabsBefore);
  });

  test("empty folder auto-deletes when last tab removed via toggle", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await createNamedFolder(sidebarPage, "AutoDelete");

    // Toggle removes tab from folder, folder becomes empty → auto-deletes
    await sidebarPage.createFolder(); // toggles off

    await expect(async () => {
      expect(await sidebarPage.getFolderCount()).toBe(0);
    }).toPass({ timeout: 5_000 });
  });

  // BUG: Closing the last tab in a folder should auto-delete the folder,
  // but TABS_CLOSE doesn't call autoDeleteIfEmpty.
  test.fail(
    "empty folder auto-deletes when last tab is closed",
    async ({ sidebarPage, commandPalettePage }) => {
      await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
      await createNamedFolder(sidebarPage, "AutoDelete");

      // Close the tab inside the folder
      await sidebarPage.closeTabByIndex(0);

      // Folder should auto-delete but doesn't (bug)
      await expect(async () => {
        expect(await sidebarPage.getFolderCount()).toBe(0);
      }).toPass({ timeout: 5_000 });
    },
  );
});

// ── Drag and drop ────────────────────────────────────────────────

test.describe("folder drag-and-drop", () => {
  test("can drag tab into a folder", async ({ sidebarPage, commandPalettePage }) => {
    const tabA = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.org");

    // Create folder from tab A
    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "DropTarget");

    // Drag tab B (now the unfolderd tab) into folder
    // After folder creation, the non-folder tab is the one outside
    const outsideTabs = sidebarPage.sidebar.locator(
      "[data-tab-id]:not([data-folder-id] [data-tab-id])",
    );
    const outsideCount = await outsideTabs.count();
    expect(outsideCount).toBeGreaterThan(0);

    // Drag using index — the outside tab
    await outsideTabs.first().dragTo(sidebarPage.folder("DropTarget").locator("span").first());

    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("DropTarget")).toBe(2);
    }).toPass({ timeout: 5_000 });
  });

  test("can move tab out of folder when only folders in bookmarked section", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabA = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    const tabB = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.org");

    // Put tab A in a folder
    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "OnlyFolder");

    // Drag tab B into the folder too
    const outsideTabs = sidebarPage.sidebar.locator(
      "[data-tab-id]:not([data-folder-id] [data-tab-id])",
    );
    await outsideTabs.first().dragTo(sidebarPage.folder("OnlyFolder").locator("span").first());
    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("OnlyFolder")).toBe(2);
    }).toPass({ timeout: 3_000 });

    // Now all bookmarked tabs are in the folder. Use toggle to move one out.
    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await sidebarPage.createFolder(); // toggles off → moves to root

    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("OnlyFolder")).toBe(1);
    }).toPass({ timeout: 5_000 });

    // Tab is now at root
    expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(2);
  });
});

// ── Multiple folders ─────────────────────────────────────────────

test.describe("multiple folders", () => {
  test("can create multiple independent folders", async ({ sidebarPage, commandPalettePage }) => {
    const tabA = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    const tabB = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.org");

    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Folder A");

    await sidebarPage.activateTabById(tabB);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Folder B");

    const names = await sidebarPage.getFolderNames();
    expect(names).toContain("Folder A");
    expect(names).toContain("Folder B");
  });

  test("deleting one folder does not affect other folders", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    const tabA = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    const tabB = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.org");

    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Keep");

    await sidebarPage.activateTabById(tabB);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Remove");

    await sidebarPage.removeFolder("Remove");

    await expect(async () => {
      expect(await sidebarPage.getFolderCount()).toBe(1);
    }).toPass({ timeout: 3_000 });
    expect(await sidebarPage.getFolderNames()).toContain("Keep");
  });

  test("can move tab between folders via drag", async ({ sidebarPage, commandPalettePage }) => {
    const tabA = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.com");
    const tabB = await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.org");
    await createBookmarkedTab(sidebarPage, commandPalettePage, "https://example.net");

    // Create Source folder with tab A
    await sidebarPage.activateTabById(tabA);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Source");

    // Create Destination folder with tab B
    await sidebarPage.activateTabById(tabB);
    await sidebarPage.page.waitForTimeout(200);
    await createNamedFolder(sidebarPage, "Destination");

    // Drag the remaining outside tab into Source
    const outsideTabs = sidebarPage.sidebar.locator(
      "[data-tab-id]:not([data-folder-id] [data-tab-id])",
    );
    await outsideTabs.first().dragTo(sidebarPage.folder("Source").locator("span").first());
    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("Source")).toBe(2);
    }).toPass({ timeout: 3_000 });

    // Drag one tab from Source to Destination
    const sourceTab = sidebarPage.folder("Source").locator("[data-tab-id]").last();
    await sourceTab.dragTo(sidebarPage.folder("Destination").locator("span").first());
    await expect(async () => {
      expect(await sidebarPage.getFolderTabCount("Destination")).toBe(2);
    }).toPass({ timeout: 5_000 });
  });
});
