import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "main",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/renderer/**"],
        },
      },
      {
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
