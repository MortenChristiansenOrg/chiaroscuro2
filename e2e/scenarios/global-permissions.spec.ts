import { expect, test } from "../fixtures/electron-app";
import { GlobalPermissionsPage } from "../pages/global-permissions.page";

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
  let settings = new GlobalPermissionsPage(session.shell);

  await settings.navigateToPermissions();
  await settings.search.fill("fullscreen");
  await expect(settings.choice("Fullscreen")).toHaveValue("");
  await settings.choice("Fullscreen").selectOption("allow");
  await expect(settings.choice("Fullscreen")).toHaveValue("allow");
  await expect(settings.emptySearch).toHaveCount(0);
  expect((await session.capture("global-fullscreen")).status).toBe("complete");

  await settings.search.fill("copy");
  const clipboard = settings.choice("Clipboard Write");
  await clipboard.selectOption("allow");
  await expect(clipboard).toHaveValue("allow");
  await expect(settings.choice("Fullscreen")).toHaveCount(0);

  await session.command("domain-settings:open", { domain: "example.com" });
  await settings.navigateToPermissions();
  await expect(settings.inherited("Allowed")).toHaveCount(2);
  await expect(settings.domainEditButtons).toHaveCount(0);
  expect((await session.capture("inherited-domain-permissions")).status).toBe("complete");

  await session.restart();
  settings = new GlobalPermissionsPage(session.shell);
  await session.command("domain-settings:open", { domain: "example.com" });
  await settings.navigateToPermissions();
  await expect(settings.inherited("Allowed")).toHaveCount(2);
  await settings.openGlobalSettings();
  await settings.search.fill("fullscreen");
  await expect(settings.choice("Fullscreen")).toHaveValue("allow");
  await settings.choice("Fullscreen").selectOption("deny");
  await expect(settings.choice("Fullscreen")).toHaveValue("deny");

  await session.command("domain-settings:open", { domain: "new.example.com" });
  await settings.navigateToPermissions();
  await expect(settings.inherited("Denied")).toHaveCount(1);
  await settings.openGlobalSettings();
  await settings.search.fill("fullscreen");
  await settings.reset("Fullscreen");
  await expect(settings.choice("Fullscreen")).toHaveValue("");

  await session.command("domain-settings:open", { domain: "example.com" });
  await settings.navigateToPermissions();
  await expect(settings.domainAllow("Fullscreen")).toBeVisible();
  await expect(settings.domainRevoke("Fullscreen")).toBeVisible();
  expect((await session.capture("reset-restores-domain-choice")).status).toBe("complete");

  await session.restart();
  settings = new GlobalPermissionsPage(session.shell);
  await session.command("settings:open");
  await settings.search.fill("fullscreen");
  await expect(settings.choice("Fullscreen")).toHaveValue("");
});
