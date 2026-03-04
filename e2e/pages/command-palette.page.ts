import { type Locator, type Page, expect } from "@playwright/test";
import type { ElectronApplication } from "playwright";

export class CommandPalettePage {
  readonly page: Page;
  readonly overlay: Locator;
  readonly input: Locator;

  constructor(page: Page) {
    this.page = page;
    this.overlay = page.locator("[data-testid='command-palette']");
    this.input = this.overlay.locator("input");
  }

  async open() {
    await this.page.evaluate(() =>
      window.chiaroscuro.sendCommand("command-palette:toggle", undefined),
    );
    await this.overlay.waitFor({ state: "visible" });
  }

  /** Open via native Ctrl+T shortcut. Requires electronApp because CDP
   *  keyboard events don't trigger Electron's before-input-event handler.
   *  Retries the input event since sendInputEvent can be unreliable under
   *  parallel load. */
  async openViaKeyboard(electronApp: ElectronApplication) {
    const sendCtrlT = () =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.sendInputEvent({ type: "keyDown", keyCode: "T", modifiers: ["control"] });
        }
      });

    await sendCtrlT();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.overlay.waitFor({ state: "visible", timeout: 1_500 });
        return;
      } catch {
        await sendCtrlT();
      }
    }
    await this.overlay.waitFor({ state: "visible", timeout: 2_000 });
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

  async submit() {
    await this.page.keyboard.press("Enter");
  }

  async submitInCurrentTab() {
    await this.page.keyboard.press("Control+Enter");
  }

  /** Read the resolution indicator text (e.g. "Search with Google", "Navigate to ..."). */
  async getResolutionText(): Promise<string | null> {
    const indicator = this.overlay.locator("div").filter({ hasText: /Search with|Navigate to/ });
    await expect(indicator.first()).toBeVisible({ timeout: 3_000 });
    return indicator.first().textContent();
  }

  /** Count suggestion items in the dropdown. */
  async getSuggestionCount(): Promise<number> {
    const suggestionsContainer = this.overlay.locator(
      "div:has(> div.flex.items-center.cursor-pointer)",
    );
    if ((await suggestionsContainer.count()) === 0) return 0;
    return suggestionsContainer.first().locator("> div").count();
  }
}
