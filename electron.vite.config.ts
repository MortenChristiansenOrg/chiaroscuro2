import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const _require = createRequire(import.meta.url);
// Resolve actual node_modules root (may differ from project root in git worktrees)
const nodeModulesRoot = resolve(dirname(_require.resolve("vite/package.json")), "../..");

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          tab: resolve(__dirname, "src/preload/tab.ts"),
        },
      },
    },
  },
  renderer: {
    server: {
      port: 5199,
      watch: {
        usePolling: true,
        interval: 500,
      },
      fs: {
        allow: [resolve("."), nodeModulesRoot],
      },
    },
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
      tailwindcss(),
    ],
  },
});
