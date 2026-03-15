import type { Locator, Page } from "@playwright/test";

export class SettingsPage {
  readonly page: Page;
  readonly content: Locator;

  constructor(page: Page) {
    this.page = page;
    // Settings renders inline in <main>
    this.content = page.locator("main");
  }

  /** Get count of provider rows (each has a "Remove provider" button). */
  async getProviderCount(): Promise<number> {
    return this.content.locator("button[aria-label='Remove provider']").count();
  }

  /** Click the "Add provider" button. */
  async addProvider() {
    await this.content.locator("button", { hasText: "Add provider" }).click();
  }

  /** Remove the provider at the given index (0-based). */
  async removeProvider(index: number) {
    await this.content.locator("button[aria-label='Remove provider']").nth(index).click();
  }

  /** Fill a provider row's fields. */
  async fillProvider(index: number, bang: string, name: string, url: string) {
    const bangInputs = this.content.locator("input[aria-label='Bang keyword']");
    const nameInputs = this.content.locator("input[aria-label='Provider name']");
    const urlInputs = this.content.locator("input[aria-label='URL template']");
    await bangInputs.nth(index).fill(bang);
    await nameInputs.nth(index).fill(name);
    await urlInputs.nth(index).fill(url);
  }

  /** Check if settings heading is visible. */
  async isVisible(): Promise<boolean> {
    return this.content.locator("h2", { hasText: "Search" }).isVisible();
  }

  /** Wait for settings page to render (heading visible). */
  async waitForVisible(timeout = 3_000) {
    await this.content.locator("h2", { hasText: "Search" }).waitFor({ state: "visible", timeout });
  }
}
