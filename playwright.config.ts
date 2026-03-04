import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  globalTimeout: 300_000,
  retries: 1,
  workers: 4,
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
