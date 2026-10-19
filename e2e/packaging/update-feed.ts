import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

/**
 * Serves a channel's packaged updater manifest and installer on loopback, as a generic
 * electron-updater feed, plus small pages to open as tabs (`/tab-a` shows "Update tab A").
 * Blockmaps are withheld so the updater downloads the whole installer instead of ranges.
 */
export async function serveUpdateFeed(directory: string, log: (line: string) => void) {
  const server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url ?? "/", "http://feed").pathname.slice(1));
    log(`${request.method} /${name}`);
    const page = /^tab-([a-z])$/.exec(name)?.[1];
    if (page) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Update tab ${page.toUpperCase()}</title><p>${page}</p>`);
      return;
    }
    const file = path.join(directory, path.basename(name));
    let size: number | undefined;
    if (name === path.basename(name) && !name.endsWith(".blockmap")) {
      try {
        const stat = statSync(file);
        if (stat.isFile()) size = stat.size;
      } catch {
        // Not part of the feed.
      }
    }
    if (size === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-length": size,
      "content-type": name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
