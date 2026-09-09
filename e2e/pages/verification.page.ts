import type { Page } from "playwright";
import type { AppSession } from "../automation/session";

export class VerificationPage {
  constructor(readonly page: Page) {}
  get message() {
    return this.page.getByRole("textbox", { name: "Message", exact: true });
  }
  get result() {
    return this.page.locator("#result");
  }
  get subTab() {
    return this.page.getByRole("link", { name: "Open sub-tab" });
  }
  get popup() {
    return this.page.getByRole("button", { name: "Open popup" });
  }
  get upload() {
    return this.page.getByLabel("Upload fixture");
  }
  get uploadedFile() {
    return this.page.locator("#file");
  }
  get scrollArea() {
    return this.page.getByLabel("Scrollable fixture");
  }
  get download() {
    return this.page.getByRole("link", { name: "Download fixture" });
  }
  get pdf() {
    return this.page.getByRole("link", { name: "Read PDF" });
  }

  async submit(message: string) {
    await this.message.click();
    await this.message.pressSequentially(message);
    await this.page.getByRole("button", { name: "Apply", exact: true }).click();
  }

  static async navigate(session: AppSession, url: string) {
    // Exercise the actual shortcut, palette window and navigation entry point.
    // Electron's before-input-event shortcuts require native input, not CDP keyboard dispatch.
    await session.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
      if (!win) throw new Error("No shell window");
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "T", modifiers: ["control"] });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "T", modifiers: ["control"] });
    });
    const palette = await session.page(await session.target((target) => target.kind === "palette"));
    const input = palette.getByRole("textbox", { name: "Search or enter URL" });
    await input.fill(url);
    await input.press("Enter");
    const target = await session.target(
      (target) => target.kind === "tab" && target.url === url && target.visible,
    );
    return new VerificationPage(await session.page(target));
  }
}
