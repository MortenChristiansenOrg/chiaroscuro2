import type { Locator, Page } from "@playwright/test";

export class WindowChromePage {
  readonly page: Page;
  readonly titleBar: Locator;
  readonly minimizeButton: Locator;
  readonly maximizeButton: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleBar = page.locator("[data-testid='title-bar']");
    this.minimizeButton = page.locator("button[aria-label='Minimize']");
    this.maximizeButton = page.locator("button[aria-label='Maximize']");
    this.closeButton = page.locator("button[aria-label='Close']");
  }

  async isVisible(): Promise<boolean> {
    return this.titleBar.isVisible();
  }
}
