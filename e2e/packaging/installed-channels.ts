/** Runs only on a disposable GitHub Windows runner: installs real NSIS builds. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type ElectronApplication, _electron as electron } from "playwright";
import { APP_CHANNELS } from "../../src/shared/app-channel";
import { waitUntil } from "../automation/wait";

if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Installed-channel verification requires a disposable GitHub Windows runner");
}
const artifacts = path.resolve("test-results/packaging");
mkdirSync(artifacts, { recursive: true });
const programs = path.join(process.env.LOCALAPPDATA ?? "", "Programs");
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
delete env.ELECTRON_RENDERER_URL;
delete env.ELECTRON_RUN_AS_NODE;
delete env.DATA_DIR;
const running = new Set<ElectronApplication>();

function install(channel: "stable" | "early-access", version: string) {
  const name = APP_CHANNELS[channel].productName.replaceAll(" ", "-");
  execFileSync(path.resolve(`dist/${channel}/${name}-Setup-${version}.exe`), ["/S"], {
    timeout: 120_000,
  });
}
function directory(channel: "stable" | "early-access") {
  // Assisted NSIS installers use the product filename as their default directory.
  return path.join(programs, APP_CHANNELS[channel].productName);
}
function executable(channel: "stable" | "early-access") {
  return path.join(directory(channel), `${APP_CHANNELS[channel].productName}.exe`);
}
function registry(key: string, value?: string) {
  return execFileSync("reg.exe", ["query", key, ...(value ? ["/v", value] : [])], {
    encoding: "utf8",
  });
}
function registration(channel: "stable" | "early-access") {
  const name = APP_CHANNELS[channel].productName;
  assert.ok(
    registry(`HKCU\\Software\\Clients\\StartMenuInternet\\${name}\\shell\\open\\command`).includes(
      executable(channel),
    ),
  );
  assert.ok(registry("HKCU\\Software\\RegisteredApplications", name).includes(name));
  assert.ok(
    registry(`HKCU\\Software\\Classes\\${name}URL\\shell\\open\\command`).includes(
      executable(channel),
    ),
  );
  assert.ok(
    registry("HKCU\\Software\\Classes\\.pdf\\OpenWithProgids", `${name}PDF`).includes(`${name}PDF`),
  );
}
async function launch(channel: "stable" | "early-access" | "dev") {
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
  return { app, info };
}
async function close(app: ElectronApplication) {
  await app.close();
  running.delete(app);
}
async function cookie(app: ElectronApplication) {
  return app.evaluate(async ({ session }) => {
    const cookies = await session.defaultSession.cookies.get({ url: "https://channel.test" });
    return cookies.find((cookie) => cookie.name === "edition")?.value;
  });
}
function uninstall(channel: "stable" | "early-access") {
  const name = APP_CHANNELS[channel].productName;
  const result = spawnSync(
    path.join(directory(channel), `Uninstall ${name}.exe`),
    ["/S", "/currentuser", `_?=${directory(channel)}`],
    // NSIS requires its final _?= argument unquoted, even with spaces. Without
    // this it spawns a detached copy and the parent returns before removal.
    // https://nsis.sourceforge.io/Docs/Chapter3.html#uninstallerusage
    { timeout: 120_000, windowsVerbatimArguments: true },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Uninstall ${name} failed: ${result.stderr?.toString()}`);
  assert.equal(existsSync(executable(channel)), false);
}

try {
  install("stable", "99.0.0");
  install("early-access", "99.1.0-beta.1");
  registration("stable");
  registration("early-access");
  const stable = await launch("stable");
  const beta = await launch("early-access");
  const dev = await launch("dev");
  assert.equal(new Set([stable.info.profile, beta.info.profile, dev.info.profile]).size, 3);
  for (const [channel, app] of [
    ["stable", stable.app],
    ["early-access", beta.app],
    ["dev", dev.app],
  ] as const) {
    assert.equal(await cookie(app), undefined);
    await app.evaluate(async ({ session }, value) => {
      await session.defaultSession.cookies.set({
        url: "https://channel.test",
        name: "edition",
        value,
        expirationDate: Date.now() / 1000 + 86400,
      });
      await session.defaultSession.cookies.flushStore();
    }, channel);
  }
  for (const [channel, app] of [
    ["stable", stable.app],
    ["early-access", beta.app],
    ["dev", dev.app],
  ] as const) {
    assert.equal(await cookie(app), channel);
  }
  // Both packaged caches come from distinct package names in app-update.yml.
  for (const channel of ["stable", "early-access"] as const) {
    const config = readFileSync(
      path.join(directory(channel), "resources", "app-update.yml"),
      "utf8",
    );
    assert.ok(config.includes(`${APP_CHANNELS[channel].packageName}-updater`));
  }
  const betaStopped = beta.app.waitForEvent("close", { timeout: 60_000 });
  install("early-access", "99.1.0-beta.2");
  await betaStopped;
  running.delete(beta.app);
  const upgraded = await launch("early-access");
  assert.equal(upgraded.info.version, "99.1.0-beta.2");
  assert.equal(await cookie(upgraded.app), "early-access");
  assert.equal(await cookie(stable.app), "stable");
  assert.equal(await cookie(dev.app), "dev");
  await close(upgraded.app);
  uninstall("early-access");
  registration("stable");
  assert.equal(await cookie(stable.app), "stable");
  assert.ok(existsSync(beta.info.profile));
  install("early-access", "99.1.0-beta.2");
  const reinstalled = await launch("early-access");
  assert.equal(await cookie(reinstalled.app), "early-access");
  await close(stable.app);
  uninstall("stable");
  registration("early-access");
  assert.equal(await cookie(reinstalled.app), "early-access");
  assert.equal(await cookie(dev.app), "dev");
  assert.ok(existsSync(stable.info.profile));
  console.log(
    "Installed channels coexist; beta upgrades and both uninstalls preserve the other channels.",
  );
} finally {
  for (const app of running) await close(app).catch(console.error);
}
