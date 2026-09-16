import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { AppSession } from "../automation/session";
import { CommandPalettePage } from "../pages/command-palette.page";
import { ExtensionsPage } from "../pages/extensions.page";
import { SidebarPage } from "../pages/sidebar.page";

test("Extensions uses built-in identity and hides historic internal routes", async ({
  playwright: _playwright,
}, info) => {
  const app = new AppSession(info.outputPath("app"));
  try {
    app.profile = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-verify-extensions-ui-"));
    await fs.writeFile(
      path.join(app.profile, "visits.json"),
      JSON.stringify([
        {
          id: "/extensions",
          url: "/extensions",
          title: "/extensions",
          visitCount: 5,
          visitedAt: Date.now(),
        },
      ]),
    );
    await app.launch();
    const palette = new CommandPalettePage(app.shell, app.app);
    await palette.openViaKeyboard(app.app);
    await palette.search("/ex");
    await expect(palette.page.locator(".sg .title")).toHaveText(["Extensions"]);
    await palette.page.locator(".sg").click();
    await expect(app.shell.getByRole("heading", { name: "Extensions", exact: true })).toBeVisible();
    const sidebar = new SidebarPage(app.shell);
    const tab = sidebar.tabList.filter({ hasText: "Extensions" });
    await expect(tab).toHaveCount(1);
    await expect(tab.locator(".fa-puzzle-piece")).toBeVisible();
    const page = new ExtensionsPage(app.shell);
    await expect(page.installCard.locator("img")).toBeVisible();
    await expect(page.installCard.locator("img")).toHaveJSProperty("naturalWidth", 128);
    await app.capture("extensions-available");
    await palette.openViaKeyboard(app.app);
    await palette.search("/ex");
    await expect(palette.page.locator(".sg .title")).toHaveText(["Extensions"]);
    await palette.page.locator(".sg").click();
    await expect(tab).toHaveCount(1);
    await app.restart();
    const reopened = new CommandPalettePage(app.shell, app.app);
    await reopened.openViaKeyboard(app.app);
    await reopened.search("/ex");
    await expect(reopened.page.locator(".sg .title")).toHaveText(["Extensions"]);
  } finally {
    await app.close();
  }
});

test("official Bitwarden installation review, cancellation and enable switch", async ({
  playwright: _playwright,
}, info) => {
  test.skip(
    process.env.BITWARDEN_INSTALL_UI_TEST !== "1",
    "Opt in to download the official Chrome Web Store package.",
  );
  test.setTimeout(120_000);
  const app = new AppSession(info.outputPath("app"), [], true);
  try {
    await app.launch();
    await app.command("extensions:open");
    let page = new ExtensionsPage(app.shell);
    await page.review();
    await expect(page.installCard.getByRole("status")).toContainText("Downloading Bitwarden");
    await app.capture("extensions-downloading");
    await expect(page.permissions).toBeVisible({ timeout: 60_000 });
    await expect(page.permissions).toContainText("Read and change data on all websites");
    await app.capture("extensions-permissions");
    await page.cancel();
    await page.review();
    await expect(page.permissions).toBeVisible({ timeout: 60_000 });
    await page.approve();
    const toggle = page.installedCard.getByRole("switch", { name: "Enable extension" });
    await expect(toggle).toBeChecked();
    await app.capture("extensions-installed");
    await toggle.focus();
    await app.shell.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeEnabled();
    await expect(page.installedCard).toContainText("Disabled");
    await app.capture("extensions-disabled");
    await app.restart();
    await app.command("extensions:open");
    page = new ExtensionsPage(app.shell);
    await expect(page.installedCard.getByRole("switch")).not.toBeChecked();
    await expect(page.installedCard.locator("img")).toBeVisible();
    await page.installedCard.getByRole("switch").click();
    await expect(page.installedCard.getByRole("switch")).toBeChecked();
    await expect(page.installedCard.getByRole("button", { name: "Open Bitwarden" })).toBeEnabled();
    await page.installedCard.getByRole("button", { name: "Open Bitwarden" }).click();
    const popup = await app.page(
      await app.target(
        (target) => target.url.startsWith("chrome-extension:") && target.url.includes("/popup/"),
      ),
    );
    await expect(popup.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
