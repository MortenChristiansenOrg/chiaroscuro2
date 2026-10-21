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

  get findInput() {
    return this.page.getByPlaceholder("Find in page");
  }

  addressBarButton(name: string) {
    return this.page.getByRole("button", { name, exact: true });
  }

  get zoomIndicator() {
    return this.titleBar.getByRole("button", { name: /^Zoom \d+%/ });
  }

  /**
   * Native hit-test targets across the top bar: each control's icon or text center and a point
   * 2px inside its edge, and empty title-bar space at least 4px from any no-drag element.
   */
  async hitTargets() {
    return this.titleBar.evaluate((bar) => {
      const center = (r: DOMRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const controls = [...bar.querySelectorAll("button, input")].flatMap((control) => {
        const box = control.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return [];
        const icon = control.querySelector("i");
        const range = document.createRange();
        range.selectNodeContents(control);
        const content = icon ? icon.getBoundingClientRect() : range.getBoundingClientRect();
        return [
          {
            name: control.getAttribute("aria-label") ?? control.getAttribute("placeholder") ?? "",
            content: center(content),
            padding: { x: box.x + 2, y: box.y + box.height / 2 },
          },
        ];
      });
      const region = (element: Element | null) =>
        element ? getComputedStyle(element).getPropertyValue("app-region") : "";
      const islands = [...bar.querySelectorAll("*")]
        .filter(
          (element) => region(element) === "no-drag" && region(element.parentElement) !== "no-drag",
        )
        .map((element) => element.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      const barBox = bar.getBoundingClientRect();
      const y = barBox.y + barBox.height / 2;
      const empty: { x: number; y: number }[] = [];
      for (let x = barBox.x + 4; x < barBox.right - 4; x += 8) {
        const near = islands.some((r) => x > r.left - 4 && x < r.right + 4);
        const target = document.elementFromPoint(x, y);
        if (!near && target && bar.contains(target) && region(target) === "drag")
          empty.push({ x, y });
      }
      return { controls, empty };
    });
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
