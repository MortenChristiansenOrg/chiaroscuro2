/** Runs only on a disposable GitHub Windows runner: installs real NSIS builds. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { APP_CHANNELS } from "../../src/shared/app-channel";
import { close, cookie, directory, executable, install, launch, running } from "./installed-app";

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
