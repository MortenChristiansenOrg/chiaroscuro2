import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 5_000, // DO NOT increase — tests must be fast; fix the test instead
  globalTimeout: 300_000,
  retries: 0,
  workers: 4,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
