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

  const server = await createServer(rendererConfig);
  if (!server.httpServer) {
    throw new Error("HTTP server not available");
  }

  await server.listen();
  server.printUrls();

  const conf = server.config.server;
  const port = conf.port;
  console.log(`\nRenderer dev server ready — set ELECTRON_RENDERER_URL=http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
