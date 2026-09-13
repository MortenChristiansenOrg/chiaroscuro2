import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/scenarios",
  // Each scenario includes evidence collection and may include a complete process restart.
  timeout: 30_000,
  // Five serial scenarios: 90s setup + 30s body + 90s teardown each, plus suite hooks.
  globalTimeout: 1_200_000,
  retries: 0,
  workers: 1,
  outputDir: "test-results/verification",
  reporter: [["list"], ["json", { outputFile: "test-results/verification/results.json" }]],
});
