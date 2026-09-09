import { test as base } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { AppSession } from "../automation/session";

type ElectronFixtures = {
  appSession: AppSession;
  electronApp: ElectronApplication;
  shellPage: Page;
};

export const test = base.extend<ElectronFixtures>({
  appSession: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixtures
    async ({}, use, testInfo) => {
      const session = new AppSession(testInfo.outputPath("evidence"));
      try {
        await session.launch();
        await use(session);
      } finally {
        try {
          await session.writeJson("result.json", {
            status: testInfo.status,
            expectedStatus: testInfo.expectedStatus,
            errors: testInfo.errors,
            title: testInfo.title,
            rerun: `bun run ${testInfo.project.testDir.endsWith("scenarios") ? "verify:app" : "e2e"} --grep ${JSON.stringify(testInfo.title)}`,
          });
          if (testInfo.status !== testInfo.expectedStatus) await session.capture("failure");
        } finally {
          await session.close();
        }
      }
    },
    // Covers bounded launch steps plus failure evidence/cleanup without raising test deadlines.
    { timeout: 90_000 },
  ],
  electronApp: async ({ appSession }, use) => {
    await use(appSession.app);
  },
  shellPage: async ({ appSession }, use) => {
    await appSession.shell.emulateMedia({ reducedMotion: "reduce" });
    await use(appSession.shell);
  },
});

export { expect } from "@playwright/test";
