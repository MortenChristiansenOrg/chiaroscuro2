import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test as base } from "@playwright/test";
import { type ElectronApplication, _electron as electron, type Page } from "playwright";

type ElectronFixtures = {
  electronApp: ElectronApplication;
  shellPage: Page;
};

export const test = base.extend<ElectronFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature requires destructured first arg
  electronApp: async ({}, use) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-test-"));
    const args = [
      ...(process.platform === "linux"
        ? [
            "--ozone-platform=headless",
            // Electron 44's headless display otherwise constrains windows to 1x1.
            "--ozone-override-screen-size=1920,1080",
            "--disable-gpu",
            "--no-sandbox",
          ]
        : []),
      "./out/main/index.js",
    ];
    const app = await electron.launch({
      args,
      env: {
        ...process.env,
        NODE_ENV: "test",
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
    await page.emulateMedia({ reducedMotion: "reduce" });
    await use(page);
  },
});

export { expect } from "@playwright/test";
