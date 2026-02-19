import react from "@vitejs/plugin-react";
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
        plugins: [react()],
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test-utils/renderer-setup.ts"],
        },
      },
    ],
  },
});
