import { expect, type Page } from "@playwright/test";

export class ExtensionsPage {
  constructor(readonly page: Page) {}
  get installCard() {
    return this.page.getByRole("article", { name: "Install Bitwarden" });
  }
  get installedCard() {
    return this.page.getByRole("article", { name: "Bitwarden Password Manager", exact: true });
  }
  get permissions() {
    return this.page.getByRole("region", { name: "Extension permissions" });
  }
  async review() {
    await this.installCard.getByRole("button", { name: "Review and install" }).click();
  }
  async approve() {
    await this.installCard.getByRole("button", { name: "Approve and install" }).click();
    await expect(this.installedCard).toBeVisible();
  }
  async cancel() {
    await this.installCard.getByRole("button", { name: "Cancel installation" }).click();
    await expect(
      this.installCard.getByRole("button", { name: "Review and install" }),
    ).toBeVisible();
  }
}
