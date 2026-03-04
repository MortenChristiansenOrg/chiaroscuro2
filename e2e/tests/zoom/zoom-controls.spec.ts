import { expect, test } from "../../fixtures/test";

test.describe("zoom controls", () => {
  test("Ctrl+= does not crash the app", async ({ shellPage }) => {
    await shellPage.keyboard.press("Control+=");
    // App should still be responsive
    const ready = shellPage.locator("[data-testid='shell-ready']");
    await expect(ready).toBeAttached({ timeout: 2_000 });
  });

  test("Ctrl+- does not crash the app", async ({ shellPage }) => {
    await shellPage.keyboard.press("Control+-");
    const ready = shellPage.locator("[data-testid='shell-ready']");
    await expect(ready).toBeAttached({ timeout: 2_000 });
  });

  test("Ctrl+0 does not crash the app", async ({ shellPage }) => {
    await shellPage.keyboard.press("Control+0");
    const ready = shellPage.locator("[data-testid='shell-ready']");
    await expect(ready).toBeAttached({ timeout: 2_000 });
  });
});
