import { expect, test } from "../../fixtures/test";

test.describe("shell composition", () => {
  test("app launches and shell is ready", async ({ shellPage }) => {
    // shellPage fixture waits for data-testid='shell-ready', so if we're here it worked
    const ready = shellPage.locator("[data-testid='shell-ready']");
    await expect(ready).toBeAttached();
  });

  test("sidebar region is visible", async ({ sidebarPage }) => {
    await expect(sidebarPage.sidebar).toBeVisible();
  });

  test("content area is present", async ({ shellPage }) => {
    const main = shellPage.locator("main");
    await expect(main).toBeVisible();
  });

  test("empty state shows Ctrl+T hint when no tabs open", async ({ shellPage }) => {
    const hint = shellPage.locator("kbd", { hasText: "Ctrl+T" });
    await expect(hint).toBeVisible();
  });

  test("command palette opens on Ctrl+T and closes on Escape", async ({ commandPalettePage }) => {
    await commandPalettePage.open();
    await expect(commandPalettePage.overlay).toBeVisible();

    await commandPalettePage.close();
    await expect(commandPalettePage.overlay).toBeHidden();
  });

  test("at least one workspace exists on fresh start", async ({ sidebarPage }) => {
    // After startup, startWorkspaces creates a default workspace
    const bubbles = sidebarPage.sidebar.locator("..").locator("button[aria-current='true']");
    await expect(bubbles.first()).toBeAttached({ timeout: 5_000 });
  });
});
