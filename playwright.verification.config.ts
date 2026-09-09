import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/scenarios",
  // Each scenario includes evidence collection and may include a complete process restart.
  timeout: 30_000,
  globalTimeout: 180_000,
  retries: 0,
  workers: 1,
  outputDir: "test-results/verification",
  reporter: [["list"], ["json", { outputFile: "test-results/verification/results.json" }]],
});
