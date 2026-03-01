import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

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
