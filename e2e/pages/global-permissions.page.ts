import type { Page } from "@playwright/test";

export class GlobalPermissionsPage {
  constructor(readonly page: Page) {}

  get search() {
    return this.page.getByPlaceholder("Search settings...");
  }

  get emptySearch() {
    return this.page.getByText("No settings match", { exact: false });
  }

  get domainPermissions() {
    return this.page.locator("#domain-settings-permissions");
  }

  get domainEditButtons() {
    return this.domainPermissions.getByRole("button", {
      name: /Revoke|Deny Fullscreen|Allow Fullscreen/,
    });
  }

  choice(label: string) {
    return this.page.getByRole("combobox", { name: `Global ${label} permission`, exact: true });
  }

  inherited(state: "Allowed" | "Denied") {
    return this.domainPermissions.getByText(`${state} — inherited from global Settings`, {
      exact: true,
    });
  }

  domainAllow(label: string) {
    return this.domainPermissions.getByRole("button", { name: `Allow ${label}`, exact: true });
  }

  domainRevoke(label: string) {
    return this.domainPermissions.getByRole("button", {
      name: `Revoke ${label} decision`,
      exact: true,
    });
  }

  async navigateToPermissions() {
    await this.page.getByRole("link", { name: "Permissions", exact: true }).click();
  }

  async reset(label: string) {
    await this.page
      .getByRole("button", { name: `Reset global ${label} permission`, exact: true })
      .click();
  }

  async openGlobalSettings() {
    await this.domainPermissions
      .getByRole("button", { name: "Manage global permissions in Settings" })
      .click();
  }
}
