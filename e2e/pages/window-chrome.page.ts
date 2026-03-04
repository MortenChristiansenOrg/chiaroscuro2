import type { Locator, Page } from "@playwright/test";

export class WindowChromePage {
  readonly page: Page;
  readonly titleBar: Locator;
  readonly minimizeButton: Locator;
  readonly maximizeButton: Locator;
  readonly closeButton: Locator;
  readonly backButton: Locator;
  readonly forwardButton: Locator;
  readonly reloadButton: Locator;
  readonly copyUrlButton: Locator;
  readonly domainCssButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleBar = page.locator("[data-testid='title-bar']");
    this.minimizeButton = page.locator("button[aria-label='Minimize']");
    this.maximizeButton = page.locator("button[aria-label='Maximize']");
    this.closeButton = page.locator("button[aria-label='Close']");
    this.backButton = page.locator("button[aria-label='Go back']");
    this.forwardButton = page.locator("button[aria-label='Go forward']");
    this.reloadButton = page.locator("button[aria-label='Reload']");
    this.copyUrlButton = page.locator("button[aria-label='Copy URL']");
    this.domainCssButton = page.locator("button[aria-label='Domain customization']");
  }

  async isVisible(): Promise<boolean> {
    return this.titleBar.isVisible();
  }

  /** Get the display URL shown in the address pill. */
  async getDisplayUrl(): Promise<string | null> {
    const pill = this.titleBar.locator(".truncate");
    if ((await pill.count()) === 0) return null;
    return pill.first().textContent();
  }

  /** Whether the URL pill is visible (hidden when no active tab). */
  async isUrlPillVisible(): Promise<boolean> {
    // UrlPill renders inside an absolutely positioned wrapper
    const pill = this.titleBar.locator(".absolute.left-1\\/2");
    return (await pill.count()) > 0;
  }

  async clickCopyUrl() {
    await this.copyUrlButton.click();
  }
}
