/** Installed-edition helpers for a disposable GitHub Windows runner: installs real NSIS builds. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type ElectronApplication, _electron as electron } from "playwright";
import { APP_CHANNELS } from "../../src/shared/app-channel";
import { waitUntil } from "../automation/wait";

if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Installed-channel verification requires a disposable GitHub Windows runner");
}
export const artifacts = path.resolve("test-results/packaging");
mkdirSync(artifacts, { recursive: true });
const programs = path.join(process.env.LOCALAPPDATA ?? "", "Programs");
export const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
delete env.ELECTRON_RENDERER_URL;
delete env.ELECTRON_RUN_AS_NODE;
delete env.DATA_DIR;
export const running = new Set<ElectronApplication>();

export function install(channel: "stable" | "early-access", version: string) {
  const name = APP_CHANNELS[channel].productName.replaceAll(" ", "-");
  execFileSync(path.resolve(`dist/${channel}/${name}-Setup-${version}.exe`), ["/S"], {
    timeout: 120_000,
  });
}
export function directory(channel: "stable" | "early-access") {
  // Assisted NSIS installers use the product filename as their default directory.
  return path.join(programs, APP_CHANNELS[channel].productName);
}
export function executable(channel: "stable" | "early-access") {
  return path.join(directory(channel), `${APP_CHANNELS[channel].productName}.exe`);
}
export async function launch(channel: "stable" | "early-access" | "dev") {
  const app = await electron.launch({
    ...(channel === "dev"
      ? { args: [path.resolve("out/main/index.js")] }
      : { executablePath: executable(channel) }),
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    timeout: 30_000,
  });
  running.add(app);
  const log = (message: string) =>
    appendFileSync(path.join(artifacts, `${channel}.log`), `${message}\n`);
  app.process().stdout?.on("data", (data) => log(String(data)));
  app.process().stderr?.on("data", (data) => log(String(data)));
  app.on("console", (message) => log(`${message.type()}: ${message.text()}`));
  const window = await waitUntil(
    "installed shell renderer",
    async () => {
      return app.windows().find((page) => page.url().endsWith("/out/renderer/index.html"));
    },
    (page) => !!page,
    30_000,
  ).catch(async (error) => {
    writeFileSync(
      path.join(artifacts, `${channel}.windows.json`),
      JSON.stringify(app.windows().map((page) => page.url())),
    );
    throw error;
  });
  if (!window) throw new Error("Installed shell disappeared");
  await window
    .locator("[data-testid='shell-ready']")
    .waitFor({ state: "attached", timeout: 30_000 })
    .catch(async (error) => {
      await window.screenshot({ path: path.join(artifacts, `${channel}.failure.png`) });
      log(await window.locator("body").innerText());
      throw error;
    });
  const nativeWindow = await app.browserWindow(window);
  assert.equal(
    await nativeWindow.evaluate((win) => win.getTitle()),
    APP_CHANNELS[channel].productName,
  );
  await window.screenshot({ path: path.join(artifacts, `${channel}.renderer.png`) });
  const info = await app.evaluate(({ app }) => ({
    name: app.getName(),
    profile: app.getPath("userData"),
    session: app.getPath("sessionData"),
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
  assert.equal(info.name, APP_CHANNELS[channel].productName);
  assert.equal(info.profile, info.session);
  assert.equal(info.packaged, channel !== "dev");
  console.log(channel, info);
  return { app, info, window };
}
export async function close(app: ElectronApplication) {
  await app.close();
  running.delete(app);
}
export async function cookie(app: ElectronApplication) {
  return app.evaluate(async ({ session }) => {
    const cookies = await session.defaultSession.cookies.get({ url: "https://channel.test" });
    return cookies.find((cookie) => cookie.name === "edition")?.value;
  });
}
