import type { Page } from "@playwright/test";

export class GlobalPermissionsPage {
  constructor(readonly page: Page) {}

  get search() {
    return this.page.getByPlaceholder("Search settings...");
  }

  get permissionPicker() {
    return this.page.getByRole("combobox", { name: "Permission to configure", exact: true });
  }

  get unknownExplanation() {
    return this.page.getByText("Applies to requests Electron could not identify.", {
      exact: false,
    });
  }

  get configuredChoices() {
    return this.page.getByRole("combobox", { name: /^Global .+ permission$/ });
  }

  async add(permission: string, decision: "allow" | "deny") {
    await this.permissionPicker.selectOption(permission);
    await this.page
      .getByRole("combobox", { name: "Global choice", exact: true })
      .selectOption(decision);
    await this.page.getByRole("button", { name: "Add permission", exact: true }).click();
  }

  get emptySearch() {
    return this.page.getByText("No settings match", { exact: false });
  }

  get domainPermissions() {
    return this.page.locator("#domain-settings-permissions");
  }

  get domainEditButtons() {
    return this.domainPermissions.getByRole("button", {
      name: /^(?:Allow|Deny|Revoke) /,
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
