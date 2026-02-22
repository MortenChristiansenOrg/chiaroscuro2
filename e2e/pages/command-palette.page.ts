import type { Locator, Page } from "@playwright/test";

export class CommandPalettePage {
  readonly page: Page;
  readonly overlay: Locator;
  readonly input: Locator;
  readonly results: Locator;

  constructor(page: Page) {
    this.page = page;
    this.overlay = page.locator("[data-testid='command-palette']");
    this.input = this.overlay.locator("input");
    this.results = this.overlay.locator("[data-testid='suggestion-list']");
  }

  async open() {
    await this.page.evaluate(() =>
      window.chiaroscuro.sendCommand("command-palette:toggle", undefined),
    );
    await this.overlay.waitFor({ state: "visible" });
  }

  async close() {
    await this.page.evaluate(() =>
      window.chiaroscuro.sendCommand("command-palette:hide", undefined),
    );
    await this.overlay.waitFor({ state: "hidden" });
  }

  async isOpen(): Promise<boolean> {
    return this.overlay.isVisible();
  }

  async search(query: string) {
    await this.input.fill(query);
  }

  async selectResult(index: number) {
    await this.results.locator(`[data-index="${index}"]`).click();
  }

  async submit() {
    await this.page.keyboard.press("Enter");
  }
}
