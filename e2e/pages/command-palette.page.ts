import { type Locator, type Page, expect } from "@playwright/test";
import type { ElectronApplication } from "playwright";

export class CommandPalettePage {
  readonly shellPage: Page;
  readonly electronApp: ElectronApplication;
  /** Locator into the palette's own BrowserWindow page (set after open). */
  private palettePage: Page | null = null;

  get overlay(): Locator {
    if (!this.palettePage) throw new Error("Palette not open");
    return this.palettePage.locator("#backdrop");
  }

  get input(): Locator {
    if (!this.palettePage) throw new Error("Palette not open");
    return this.palettePage.locator("#input");
  }

  constructor(shellPage: Page, electronApp: ElectronApplication) {
    this.shellPage = shellPage;
    this.electronApp = electronApp;
  }

  /** Find the palette BrowserWindow page from the Electron app's windows. */
  private async findPalettePage(): Promise<Page> {
    // The palette loads from a temp file. Wait for it to appear.
    for (let i = 0; i < 20; i++) {
      const pages = this.electronApp.windows();
      for (const p of pages) {
        const url = p.url();
        if (url.includes("chiaroscuro-cmd-palette")) {
          // Ensure the backdrop is visible (palette is open)
          const backdrop = p.locator("#backdrop.open");
          if ((await backdrop.count()) > 0) {
            this.palettePage = p;
            return p;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Could not find palette BrowserWindow page");
  }

  async open() {
    await this.shellPage.evaluate(() =>
      window.chiaroscuro.sendCommand("command-palette:toggle", undefined),
    );
    await this.findPalettePage();
    await expect(this.overlay).toBeVisible();
  }

  /** Open via native Ctrl+T shortcut. */
  async openViaKeyboard(electronApp: ElectronApplication) {
    const sendCtrlT = () =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => !w.webContents.getURL().startsWith("data:"),
        );
        if (win) {
          win.webContents.sendInputEvent({
            type: "keyDown",
            keyCode: "T",
            modifiers: ["control"],
          });
        }
      });

    await sendCtrlT();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.findPalettePage();
        return;
      } catch {
        await sendCtrlT();
      }
    }
    await this.findPalettePage();
  }

  async close() {
    await this.shellPage.evaluate(() =>
      window.chiaroscuro.sendCommand("command-palette:hide", undefined),
    );
    // Wait for palette to hide
    await expect(async () => {
      // The palette window still exists but should be hidden (backdrop closed)
      const pages = this.electronApp.windows();
      for (const p of pages) {
        if (p.url().includes("chiaroscuro-cmd-palette")) {
          const backdrop = p.locator("#backdrop.open");
          expect(await backdrop.count()).toBe(0);
        }
      }
    }).toPass({ timeout: 3_000 });
    this.palettePage = null;
  }

  isOpen(): boolean {
    return this.palettePage !== null;
  }

  async search(query: string) {
    await this.input.fill(query);
  }

  async submit() {
    if (!this.palettePage) throw new Error("Palette not open");
    await this.palettePage.keyboard.press("Enter");
  }

  async submitInCurrentTab() {
    if (!this.palettePage) throw new Error("Palette not open");
    await this.palettePage.keyboard.press("Control+Enter");
  }

  /** Read the resolution indicator text. */
  async getResolutionText(): Promise<string | null> {
    if (!this.palettePage) throw new Error("Palette not open");
    const res = this.palettePage.locator("#res");
    await expect(res).toBeVisible({ timeout: 3_000 });
    return res.textContent();
  }

  /** Count suggestion items in the dropdown. */
  async getSuggestionCount(): Promise<number> {
    if (!this.palettePage) throw new Error("Palette not open");
    return this.palettePage.locator(".sg").count();
  }
}
