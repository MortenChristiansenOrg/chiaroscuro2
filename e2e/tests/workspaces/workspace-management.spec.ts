import { expect, test } from "../../fixtures/test";

test.describe("workspace management", () => {
  test("switching workspace changes tab list", async ({ sidebarPage, commandPalettePage }) => {
    // Create a tab in the default workspace
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();
    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });
    const ws1Tabs = await sidebarPage.getTabCount();

    // Create a second workspace
    await sidebarPage.openAddWorkspace();
    await sidebarPage.submitWorkspaceForm("Test WS");

    await expect(async () => {
      expect(await sidebarPage.getWorkspaceNames()).toContain("Test WS");
    }).toPass({ timeout: 3_000 });

    // Switch to the new workspace
    await sidebarPage.switchWorkspace("Test WS");

    // New workspace should have no tabs
    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(0);
    }).toPass({ timeout: 3_000 });

    // Switch back — tabs should reappear
    const wsNames = await sidebarPage.getWorkspaceNames();
    const defaultWs = wsNames.find((n) => n !== "Test WS");
    if (defaultWs) {
      await sidebarPage.switchWorkspace(defaultWs);
      await expect(async () => {
        expect(await sidebarPage.getTabCount()).toBe(ws1Tabs);
      }).toPass({ timeout: 3_000 });
    }
  });

  test("creates workspace via add button", async ({ sidebarPage }) => {
    const namesBefore = await sidebarPage.getWorkspaceNames();

    await sidebarPage.openAddWorkspace();
    await sidebarPage.submitWorkspaceForm("New WS");

    await expect(async () => {
      const names = await sidebarPage.getWorkspaceNames();
      expect(names.length).toBe(namesBefore.length + 1);
      expect(names).toContain("New WS");
    }).toPass({ timeout: 5_000 });
  });

  test("edits workspace name", async ({ sidebarPage }) => {
    // Open editor for current workspace
    await sidebarPage.openWorkspaceEditor();

    // Change name
    const form = sidebarPage.page.locator("form");
    const nameInput = form.locator("input[placeholder='Workspace name']");
    await nameInput.fill("Renamed WS");
    await form.locator("button[type='submit']").click();

    await expect(async () => {
      const names = await sidebarPage.getWorkspaceNames();
      expect(names).toContain("Renamed WS");
    }).toPass({ timeout: 5_000 });
  });

  test("deletes workspace when more than one exists", async ({ sidebarPage, shellPage }) => {
    // Create a second workspace
    await sidebarPage.openAddWorkspace();
    await sidebarPage.submitWorkspaceForm("ToDelete");

    await expect(async () => {
      expect(await sidebarPage.getWorkspaceNames()).toContain("ToDelete");
    }).toPass({ timeout: 3_000 });

    // Switch to it, open editor, delete
    await sidebarPage.switchWorkspace("ToDelete");
    await sidebarPage.openWorkspaceEditor();

    // Mock confirm() — native GTK dialogs crash in headless ozone mode
    await shellPage.evaluate(() => {
      window.confirm = () => true;
    });
    await sidebarPage.deleteWorkspaceInEditor();

    await expect(async () => {
      expect(await sidebarPage.getWorkspaceNames()).not.toContain("ToDelete");
    }).toPass({ timeout: 3_000 });
  });

  test("tab persists in original workspace after switch", async ({
    sidebarPage,
    commandPalettePage,
  }) => {
    test.setTimeout(10_000);
    // Create a tab
    await commandPalettePage.open();
    await commandPalettePage.search("https://example.com");
    await commandPalettePage.submit();
    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 5_000 });

    const originalTabs = await sidebarPage.getTabIds();

    // Create and switch to new workspace
    await sidebarPage.openAddWorkspace();
    await sidebarPage.submitWorkspaceForm("Other WS");

    await expect(async () => {
      expect(await sidebarPage.getWorkspaceNames()).toContain("Other WS");
    }).toPass({ timeout: 5_000 });

    await sidebarPage.switchWorkspace("Other WS");

    await expect(async () => {
      expect(await sidebarPage.getTabCount()).toBe(0);
    }).toPass({ timeout: 3_000 });

    // Switch back
    const wsNames = await sidebarPage.getWorkspaceNames();
    const defaultWs = wsNames.find((n) => n !== "Other WS");
    if (defaultWs) {
      await sidebarPage.switchWorkspace(defaultWs);

      // Original tab should still be there
      await expect(async () => {
        const tabsNow = await sidebarPage.getTabIds();
        for (const id of originalTabs) {
          expect(tabsNow).toContain(id);
        }
      }).toPass({ timeout: 3_000 });
    }
  });
});
