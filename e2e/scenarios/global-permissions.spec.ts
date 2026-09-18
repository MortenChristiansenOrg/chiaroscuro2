import { expect, test } from "../fixtures/electron-app";

test("global permission choices persist and appear read only in domain settings", async ({
  appSession: session,
}) => {
  test.setTimeout(90_000);
  // Seed an existing domain choice so reset can demonstrate that it is preserved.
  await session.command("permissions:set", {
    domain: "example.com",
    permission: "fullscreen",
    decision: "deny",
  });
  await session.command("settings:open");
  const search = () => session.shell.getByPlaceholder("Search settings...");
  const fullscreen = () =>
    session.shell.getByRole("combobox", { name: "Global Fullscreen permission", exact: true });

  await session.shell.getByRole("link", { name: "Permissions", exact: true }).click();
  await search().fill("fullscreen");
  await expect(fullscreen()).toHaveValue("");
  await fullscreen().selectOption("allow");
  await expect(fullscreen()).toHaveValue("allow");
  await expect(session.shell.getByText("No settings match", { exact: false })).toHaveCount(0);
  expect((await session.capture("global-fullscreen")).status).toBe("complete");

  await search().fill("copy");
  const clipboard = session.shell.getByRole("combobox", {
    name: "Global Clipboard Write permission",
    exact: true,
  });
  await clipboard.selectOption("allow");
  await expect(clipboard).toHaveValue("allow");
  await expect(fullscreen()).toHaveCount(0);

  await session.command("domain-settings:open", { domain: "example.com" });
  const domainPermissions = () => session.shell.locator("#domain-settings-permissions");
  await session.shell.getByRole("link", { name: "Permissions", exact: true }).click();
  await expect(
    domainPermissions().getByText("Allowed — inherited from global Settings", { exact: true }),
  ).toHaveCount(2);
  await expect(
    domainPermissions().getByRole("button", { name: /Revoke|Deny Fullscreen|Allow Fullscreen/ }),
  ).toHaveCount(0);
  expect((await session.capture("inherited-domain-permissions")).status).toBe("complete");

  await session.restart();
  await session.command("domain-settings:open", { domain: "example.com" });
  await session.shell.getByRole("link", { name: "Permissions", exact: true }).click();
  await expect(
    domainPermissions().getByText("Allowed — inherited from global Settings", { exact: true }),
  ).toHaveCount(2);
  await domainPermissions()
    .getByRole("button", { name: "Manage global permissions in Settings" })
    .click();
  await search().fill("fullscreen");
  await expect(fullscreen()).toHaveValue("allow");
  await fullscreen().selectOption("deny");
  await expect(fullscreen()).toHaveValue("deny");

  await session.command("domain-settings:open", { domain: "new.example.com" });
  await session.shell.getByRole("link", { name: "Permissions", exact: true }).click();
  await expect(
    domainPermissions().getByText("Denied — inherited from global Settings", { exact: true }),
  ).toHaveCount(1);
  await domainPermissions()
    .getByRole("button", { name: "Manage global permissions in Settings" })
    .click();
  await search().fill("fullscreen");
  await session.shell
    .getByRole("button", { name: "Reset global Fullscreen permission", exact: true })
    .click();
  await expect(fullscreen()).toHaveValue("");

  await session.command("domain-settings:open", { domain: "example.com" });
  await session.shell.getByRole("link", { name: "Permissions", exact: true }).click();
  await expect(
    domainPermissions().getByRole("button", { name: "Allow Fullscreen", exact: true }),
  ).toBeVisible();
  await expect(
    domainPermissions().getByRole("button", { name: "Revoke Fullscreen decision", exact: true }),
  ).toBeVisible();
  expect((await session.capture("reset-restores-domain-choice")).status).toBe("complete");

  await session.restart();
  await session.command("settings:open");
  await search().fill("fullscreen");
  await expect(fullscreen()).toHaveValue("");
});
