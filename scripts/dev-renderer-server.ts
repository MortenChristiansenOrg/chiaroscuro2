/**
 * Starts only the Vite renderer dev server using electron-vite's config resolution.
 * Used by dev:win to serve HMR to a Windows-side Electron process.
 *
 * This replicates lines 55-72 of electron-vite's createServer() without
 * calling startElectron(), so the dev server stays alive on WSL while
 * Electron runs natively on Windows.
 */

import { resolveConfig } from "electron-vite";
import { createServer } from "vite";

async function main(): Promise<void> {
  process.env.NODE_ENV_ELECTRON_VITE = "development";

  const config = await resolveConfig({}, "serve", "development");
  const rendererConfig = config.config?.renderer;

  if (!rendererConfig) {
    console.error("No renderer config found in electron.vite.config.ts");
    process.exit(1);
  }

  // Allow overriding the port via env var, with strictPort to fail fast if busy
  const portOverride = process.env.ELECTRON_VITE_DEV_SERVER_PORT;
  if (portOverride) {
    rendererConfig.server = {
      ...rendererConfig.server,
      port: Number(portOverride),
      strictPort: true,
    };
  }

  const server = await createServer(rendererConfig);
  if (!server.httpServer) {
    throw new Error("HTTP server not available");
  }

  await server.listen();
  server.printUrls();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
