import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test as base } from "@playwright/test";
import { type ElectronApplication, type Page, _electron as electron } from "playwright";

type ElectronFixtures = {
  electronApp: ElectronApplication;
  shellPage: Page;
};

export const test = base.extend<ElectronFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature requires destructured first arg
  electronApp: async ({}, use) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-test-"));
    const app = await electron.launch({
      args: ["./out/main/index.js"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        ELECTRON_DISABLE_GPU: "1",
        DATA_DIR: tmpDir,
      },
    });
    await use(app);
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  },

  shellPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForSelector("[data-testid='shell-ready']", {
      state: "attached",
      timeout: 15_000,
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
