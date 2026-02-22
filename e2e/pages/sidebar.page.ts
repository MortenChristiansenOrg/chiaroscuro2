import type { Locator, Page } from "@playwright/test";

export class SidebarPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly tabList: Locator;
  readonly activeTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator("nav[aria-label='Sidebar']");
    this.tabList = this.sidebar.locator("[data-tab-id]");
    this.activeTab = this.sidebar.locator("[data-tab-id][style*='glass-active']");
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

  async closeTabByIndex(index: number) {
    const tab = this.tabList.nth(index);
    await tab.hover();
    await tab.locator("[aria-label='Close tab']").click();
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
    await this.sidebar.locator(`button[aria-label="${name}"]`).click();
  }

  async getWorkspaceNames(): Promise<string[]> {
    const bubbles = this.sidebar
      .locator("..")
      .locator("button[aria-label]")
      .filter({ hasNot: this.page.locator("[aria-label='Close tab']") })
      .filter({ hasNot: this.page.locator("[aria-label='Add workspace']") })
      .filter({ hasNot: this.page.locator("[aria-label='Edit workspace']") });
    const count = await bubbles.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await bubbles.nth(i).getAttribute("aria-label");
      if (label) names.push(label);
    }
    return names;
  }
}
