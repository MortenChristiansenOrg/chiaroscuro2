import type { Page } from "@playwright/test";

/** UI of the official extension; owns no vault or authentication implementation. */
export class BitwardenPopupPage {
  constructor(readonly page: Page) {}

  async login(email: string, password: string, server: string, verificationCode?: () => string) {
    await this.page.getByRole("button", { name: "Log in", exact: true }).click();
    await this.page.getByRole("button", { name: "bitwarden.com", exact: true }).click();
    await this.page.getByRole("menuitem", { name: "self-hosted", exact: true }).click();
    await this.page.getByRole("textbox", { name: "Server URL", exact: true }).fill(server);
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
    await this.page.getByRole("textbox", { name: /Email address/ }).fill(email);
    await this.page.getByRole("button", { name: "Continue", exact: true }).click();
    await this.page.getByLabel("Master password", { exact: false }).fill(password);
    await this.page.getByRole("button", { name: /^Log in(?: with master password)?$/ }).click();
    if (verificationCode) {
      await this.page.getByRole("textbox", { name: /Verification code/ }).fill(verificationCode());
      await this.page.getByRole("button", { name: "Continue logging in", exact: true }).click();
    }
  }

  async unlock(password: string) {
    await this.page.getByLabel("Master password", { exact: false }).fill(password);
    await this.page.getByRole("button", { name: "Unlock", exact: true }).click();
  }

  async waitForItem(name: string) {
    await this.page.getByText(name, { exact: true }).first().waitFor({ timeout: 20_000 });
  }

  async editPassword(name: string, username: string, password: string) {
    await this.page
      .getByRole("button", { name: `View item - ${name} - ${username}`, exact: true })
      .first()
      .click();
    await this.page.getByRole("button", { name: "Edit", exact: true }).click();
    await this.page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
    await this.page.getByRole("heading", { name: "View Login", exact: true }).waitFor();
    await this.page.getByRole("button", { name: "Back", exact: true }).click();
  }

  async generatePassword(): Promise<string> {
    await this.page.getByRole("link", { name: "Generator", exact: true }).click();
    await this.page.getByRole("button", { name: "Generate password", exact: true }).click();
    const password = (await this.page.locator("code").allTextContents()).join("");
    await this.page.getByRole("link", { name: "Vault", exact: true }).click();
    return password;
  }

  async createLogin(name: string, username: string, password: string, uri: string) {
    await this.page.getByRole("button", { name: /New$/ }).click();
    await this.page.getByRole("menuitem", { name: "Login", exact: true }).click();
    await this.page.getByRole("textbox", { name: /^Item name/ }).fill(name);
    await this.page.getByRole("textbox", { name: "Username", exact: true }).fill(username);
    await this.page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await this.page.getByRole("textbox", { name: "Website (URI)", exact: true }).fill(uri);
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
    await this.page.getByRole("heading", { name, exact: true }).waitFor();
  }

  async fill(name: string) {
    await this.page.getByRole("button", { name: `Autofill - ${name}`, exact: true }).click();
  }

  async waitForVault() {
    await this.page.getByRole("heading", { name: "Vault", exact: true }).waitFor();
  }

  get fixtureSuggestions() {
    return this.page.getByRole("button", { name: /^Autofill - Fixture/ });
  }
}
