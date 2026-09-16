import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppSession } from "../automation/session";
import { startSite } from "../automation/site";

// Fresh isolated profiles, warm filesystem caches, real Electron processes.
// Includes the verification controller's launch overhead; compare identical hosts.
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Use an alphanumeric result label");
const site = await startSite();
const results = [];
try {
  for (const count of [0, 20, 100]) {
    for (let run = 0; run < 5; run++) {
      const session = new AppSession(path.resolve(`test-results/startup/${label}/${count}-${run}`));
      session.profile = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-verify-"));
      const now = Date.now();
      await fs.writeFile(
        path.join(session.profile, "workspaces.json"),
        JSON.stringify([
          { id: "benchmark", name: "Benchmark", color: "#555", icon: "B", order: 0 },
        ]),
      );
      await fs.writeFile(
        path.join(session.profile, "tabs.json"),
        JSON.stringify(
          Array.from({ length: count }, (_, i) => ({
            id: `benchmark-${i}`,
            workspaceId: "benchmark",
            url: `${site.url}/parent?tab=${i}`,
            title: `Tab ${i}`,
            favicon: "",
            bookmarked: true,
            lastAccessedAt: now - i,
            createdAt: now,
            order: i,
            folderId: null,
          })),
        ),
      );
      try {
        const start = performance.now();
        await session.launch();
        if (count) {
          const target = await session.target((t) => t.tabId === "benchmark-0");
          await (await session.page(target)).waitForLoadState("domcontentloaded");
        }
        const readyMs = performance.now() - start;
        const metrics = await session.app.evaluate(({ app, webContents }) => ({
          webContents: webContents.getAllWebContents().length,
          workingSetKiB: app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0),
        }));
        const updaterLoadMs = await session.app.evaluate(({ app }) => {
          const { createRequire } = process.getBuiltinModule("node:module");
          const require = createRequire(`${app.getAppPath()}/package.json`);
          const start = performance.now();
          void require("electron-updater");
          return Math.round(performance.now() - start);
        });
        results.push({ count, run, readyMs: Math.round(readyMs), updaterLoadMs, ...metrics });
        console.log(JSON.stringify(results.at(-1)));
      } finally {
        await session.close();
      }
    }
  }
} finally {
  await site.close();
  await fs.mkdir("test-results/startup", { recursive: true });
  await fs.writeFile(`test-results/startup/${label}.json`, JSON.stringify(results, null, 2));
}
