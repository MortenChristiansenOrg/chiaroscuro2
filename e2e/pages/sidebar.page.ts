import { type Locator, type Page, expect } from "@playwright/test";

export class SidebarPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly tabList: Locator;
  readonly activeTab: Locator;
  readonly folderList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator("nav[aria-label='Sidebar']");
    this.tabList = this.sidebar.locator("[data-tab-id]");
    this.activeTab = this.sidebar.locator("[data-tab-id][style*='glass-active']");
    this.folderList = this.sidebar.locator("[data-folder-id]");
  }

  async isVisible(): Promise<boolean> {
    return this.sidebar.isVisible();
  }

  async getTabCount(): Promise<number> {
    return this.tabList.count();
  }

  async clickTab(title: string) {
    await this.sidebar.locator("[data-tab-id]", { hasText: title }).click();
  }

  async closeTab(title: string) {
    const tab = this.sidebar.locator("[data-tab-id]", { hasText: title });
    await tab.hover();
    await tab.locator("[aria-label='Close tab']").click();
  }

  async clickTabByIndex(index: number) {
    await this.tabList.nth(index).click();
  }

  async closeTabByIndex(index: number) {
    const tab = this.tabList.nth(index);
    await tab.hover();
    await tab.locator("[aria-label='Close tab']").click();
  }

  /** Activate tab by its data-tab-id attribute value. */
  async activateTabById(tabId: string) {
    await this.page.evaluate(
      (id) => window.chiaroscuro.sendCommand("tabs:activate", { tabId: id }),
      tabId,
    );
  }

  /** Wait until a tab has active (glass-active) styling. */
  async waitForActiveTab(tabId: string) {
    await expect(async () => {
      const style = await this.sidebar.locator(`[data-tab-id="${tabId}"]`).getAttribute("style");
      expect(style).toContain("glass-active");
    }).toPass({ timeout: 2_000 });
  }

  /** Get data-tab-id values for all visible tabs. */
  async getTabIds(): Promise<string[]> {
    const count = await this.tabList.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = await this.tabList.nth(i).getAttribute("data-tab-id");
      if (id) ids.push(id);
    }
    return ids;
  }

  async dragTab(fromTitle: string, toTitle: string) {
    const from = this.sidebar.locator("[data-tab-id]", { hasText: fromTitle });
    const to = this.sidebar.locator("[data-tab-id]", { hasText: toTitle });
    await from.dragTo(to);
  }

  async getTabTitles(): Promise<string[]> {
    const tabs = this.sidebar.locator("[data-tab-id]");
    const count = await tabs.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await tabs.nth(i).locator("span").first().textContent();
      if (text) titles.push(text.trim());
    }
    return titles;
  }

  async switchWorkspace(name: string) {
    await this.sidebar.locator(`[data-workspace-id][aria-label="${name}"]`).click();
  }

  async getWorkspaceNames(): Promise<string[]> {
    const bubbles = this.sidebar.locator("[data-workspace-id]");
    const count = await bubbles.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await bubbles.nth(i).getAttribute("aria-label");
      if (label) names.push(label);
    }
    return names;
  }

  // ── Pinned tab methods ─────────────────────────────────────────

  /** Get all pinned tab elements. */
  get pinnedTabs(): Locator {
    return this.sidebar.locator("[data-pinned-tab]");
  }

  async getPinnedTabCount(): Promise<number> {
    return this.pinnedTabs.count();
  }

  async getPinnedTabIds(): Promise<string[]> {
    const count = await this.pinnedTabs.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = await this.pinnedTabs.nth(i).getAttribute("data-pinned-tab");
      if (id) ids.push(id);
    }
    return ids;
  }

  async clickPinnedTab(id: string) {
    await this.sidebar.locator(`[data-pinned-tab="${id}"]`).click();
  }

  /** Pin the active tab via command. */
  async pinActiveTab() {
    await this.page.evaluate(() => window.chiaroscuro.sendCommand("pinned-tabs:toggle-pin", {}));
  }

  // ── Bookmark methods ───────────────────────────────────────────

  /** Bookmark the active tab via command. */
  async bookmarkActiveTab() {
    await this.page.evaluate(() => window.chiaroscuro.sendCommand("tabs:toggle-bookmark", {}));
  }

  /** Check if a tab is ephemeral via data-ephemeral attribute. */
  async isTabEphemeral(tabId: string): Promise<boolean> {
    const tab = this.sidebar.locator(`[data-tab-id="${tabId}"]`);
    return (await tab.getAttribute("data-ephemeral")) !== null;
  }

  // ── Workspace editor methods ───────────────────────────────────

  /** Open workspace editor by double-clicking the active workspace bubble. */
  async openWorkspaceEditor() {
    await this.sidebar.locator("[data-workspace-id][aria-current='true']").dblclick();
  }

  /** Create a workspace via command (native context menu not automatable). */
  async createWorkspace(name: string, color = "oklch(0.6 0.15 250)", icon = "W") {
    await this.page.evaluate(
      ({ name, color, icon }) =>
        window.chiaroscuro.sendCommand("workspaces:create", { name, color, icon }),
      { name, color, icon },
    );
  }

  /** Fill workspace editor name field and submit. */
  async submitWorkspaceForm(name: string) {
    const form = this.page.locator("form");
    const nameInput = form.locator("input[placeholder='Workspace name']");
    await nameInput.fill(name);
    await form.locator("button[type='submit']").click();
  }

  /** Click Delete in the workspace editor. */
  async deleteWorkspaceInEditor() {
    const form = this.page.locator("form");
    await form.locator("button", { hasText: "Delete" }).click();
  }

  // ── Folder methods ──────────────────────────────────────────────

  folder(name: string): Locator {
    return this.folderList.filter({ hasText: name });
  }

  async getFolderCount(): Promise<number> {
    return this.folderList.count();
  }

  async getFolderNames(): Promise<string[]> {
    const count = await this.folderList.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await this.folderList.nth(i).locator("span").first().textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /** Toggle folder membership for the active tab via command. */
  async createFolder() {
    await this.page.evaluate(() => window.chiaroscuro.sendCommand("folders:toggle", {}));
  }

  /** Rename a folder by double-clicking and typing a new name. */
  async renameFolder(currentName: string, newName: string) {
    const folder = this.folder(currentName);
    // Get the folder ID before double-click changes the DOM
    const folderId = await folder.getAttribute("data-folder-id");
    const folderHeader = folder.locator("span").first();
    await folderHeader.dblclick();
    // After double-click, span is replaced by input — use folder ID to locate
    const folderById = this.sidebar.locator(`[data-folder-id="${folderId}"]`);
    const input = folderById.locator("input");
    await input.fill(newName);
    await input.press("Enter");
  }

  /** Submit the inline rename input (for newly created folders). */
  async submitFolderRename(name: string) {
    const input = this.folderList.locator("input");
    await input.fill(name);
    await input.press("Enter");
  }

  /** Click a folder header to toggle collapse. */
  async toggleFolderCollapse(name: string) {
    await this.folder(name).locator("span").first().click();
  }

  /** Check if a folder is collapsed (children hidden). */
  async isFolderCollapsed(name: string): Promise<boolean> {
    const folder = this.folder(name);
    return (await folder.getAttribute("data-collapsed")) !== null;
  }

  /** Remove folder via the X button. */
  async removeFolder(name: string) {
    const folder = this.folder(name);
    await folder.hover();
    await folder.locator("[aria-label='Remove folder']").click();
  }

  /** Get tab titles within a specific folder. */
  async getFolderTabTitles(folderName: string): Promise<string[]> {
    const folder = this.folder(folderName);
    const tabs = folder.locator("[data-tab-id]");
    const count = await tabs.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await tabs.nth(i).locator("span").first().textContent();
      if (text) titles.push(text.trim());
    }
    return titles;
  }

  /** Get tab count within a specific folder. */
  async getFolderTabCount(folderName: string): Promise<number> {
    return this.folder(folderName).locator("[data-tab-id]").count();
  }

  /** Drag a tab onto a folder header. */
  async dragTabToFolder(tabTitle: string, folderName: string) {
    const tab = this.sidebar.locator("[data-tab-id]", { hasText: tabTitle });
    const folderHeader = this.folder(folderName).locator("span").first();
    await tab.dragTo(folderHeader);
  }

  /** Drag a tab (by index) onto a folder header. */
  async dragTabByIndexToFolder(tabIndex: number, folderName: string) {
    const tab = this.tabList.nth(tabIndex);
    const folderHeader = this.folder(folderName).locator("span").first();
    await tab.dragTo(folderHeader);
  }

  /** Drag a tab out of a folder to the bookmarked section root. */
  async dragTabOutOfFolder(tabTitle: string, targetTabTitle: string) {
    await this.dragTab(tabTitle, targetTabTitle);
  }
}
