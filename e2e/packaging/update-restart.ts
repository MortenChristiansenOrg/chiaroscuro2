/**
 * On demand only (.github/workflows/update-restart.yml), on a disposable GitHub Windows runner:
 * installs a real Early Access build, serves a newer one from a local update feed and restarts
 * to update as a user would, first with the downloaded installer missing, not executable and
 * blocked, then intact. Run it when changing src/features/installer/ or electron-updater.
 */
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { APP_CHANNELS } from "../../src/shared/app-channel";
import { waitUntil } from "../automation/wait";
import {
  artifacts,
  close,
  directory,
  env,
  executable,
  install,
  launch,
  running,
} from "./installed-app";
import { serveUpdateFeed } from "./update-feed";

const detached = new Set<{ child: ChildProcess; browser?: Browser }>();
/**
 * Start an installed edition as a user would and drive its shell through Chromium's DevTools
 * protocol. Unlike a Playwright launch, no Node inspector is attached: a browser that quits
 * by itself would wait for the inspector to disconnect, and only the installer would end it.
 */
async function startDetached(channel: "early-access") {
  const port = 9339;
  const child = spawn(executable(channel), [`--remote-debugging-port=${port}`], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const running = { child } as { child: ChildProcess; browser?: Browser };
  detached.add(running);
  const log = (data: Buffer) =>
    appendFileSync(
      path.join(artifacts, `${channel}.update.log`),
      `${new Date().toISOString()} ${String(data).trimEnd()}\n`,
    );
  child.stdout?.on("data", log);
  child.stderr?.on("data", log);
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  const browser = await waitUntil(
    "DevTools endpoint",
    () => chromium.connectOverCDP(`http://127.0.0.1:${port}`),
    Boolean,
    30_000,
  );
  running.browser = browser;
  const shell = await waitUntil(
    "detached shell renderer",
    async () =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().endsWith("/out/renderer/index.html")),
    (page) => !!page,
    30_000,
  );
  if (!shell) throw new Error("Detached shell disappeared");
  shell.on("console", (message) => log(Buffer.from(`shell ${message.type()}: ${message.text()}`)));
  await shell
    .locator("[data-testid='shell-ready']")
    .waitFor({ state: "attached", timeout: 30_000 });
  return { child, exited, shell, alive: () => child.exitCode === null };
}
function step(message: string) {
  console.log(`${new Date().toISOString()} ${message}`);
}
function powershell(command: string) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    timeout: 60_000,
  }).trim();
}
function desktopScreenshot(name: string) {
  powershell(`Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
$bitmap.Save('${path.join(artifacts, `${name}.png`)}', [System.Drawing.Imaging.ImageFormat]::Png)`);
}
/** Serve the edition's updates from a local feed instead of its GitHub releases. */
function serveUpdatesFrom(channel: "early-access", url: string) {
  const file = path.join(directory(channel), "resources", "app-update.yml");
  const config = readFileSync(file, "utf8");
  assert.match(config, /^provider: github$/m);
  const cache = /^updaterCacheDirName: .+$/m.exec(config)?.[0];
  assert.ok(cache, "app-update.yml names no updater cache");
  const channelName = APP_CHANNELS[channel].updateChannel;
  writeFileSync(file, `provider: generic\nurl: ${url}\nchannel: ${channelName}\n${cache}\n`);
}
/** The version Windows lists for an installed edition, from its uninstall entry. */
function installedVersion(channel: "stable" | "early-access") {
  const name = APP_CHANNELS[channel].productName;
  return powershell(
    `(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '${name} *' } | Select-Object -First 1).DisplayVersion`,
  );
}
interface AppProcess {
  ProcessId: number;
  ExecutablePath: string | null;
  CommandLine: string | null;
}
/** Running browser processes of an edition (main, renderer, GPU and utility processes). */
function processes(channel: "stable" | "early-access"): AppProcess[] {
  const name = `${APP_CHANNELS[channel].productName}.exe`;
  return JSON.parse(
    powershell(
      `ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter "Name = '${name}'" | Select-Object ProcessId, ExecutablePath, CommandLine)`,
    ) || "[]",
  );
}
/** Close an edition's browser started outside the test by closing its window, as a user would. */
async function stop(channel: "early-access") {
  await waitUntil(
    "browser closed",
    async () => {
      // Without /F, taskkill asks each window to close; windowless helper processes refuse.
      // Repeated until the browser is gone, in case it had no window yet.
      spawnSync("taskkill.exe", ["/IM", `${APP_CHANNELS[channel].productName}.exe`]);
      return processes(channel);
    },
    (list) => list.length === 0,
    60_000,
  );
}
/** The installer electron-updater downloaded and keeps ready to start. */
function pendingInstaller(channel: "early-access") {
  const pending = path.join(
    process.env.LOCALAPPDATA ?? "",
    `${APP_CHANNELS[channel].packageName}-updater`,
    "pending",
  );
  const installers = readdirSync(pending).filter((name) => name.endsWith(".exe"));
  assert.equal(installers.length, 1, `Expected one pending installer: ${installers.join(", ")}`);
  return path.join(pending, installers[0] ?? "");
}
/** Start acting as the user of the update installer once it starts; see installer-wizard.ps1. */
async function watchInstaller(installer: string) {
  const wizard = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.resolve("e2e/packaging/installer-wizard.ps1"),
      "-ProcessName",
      path.basename(installer, ".exe"),
      "-Artifacts",
      artifacts,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  const { promise: watching, resolve: ready } = Promise.withResolvers<void>();
  const record = (data: Buffer) => {
    output += String(data);
    appendFileSync(path.join(artifacts, "update-installer.log"), String(data));
    if (output.includes("watching")) ready();
  };
  wizard.stdout.on("data", record);
  wizard.stderr.on("data", record);
  const finished = new Promise<string>((resolve, reject) => {
    wizard.once("error", reject);
    wizard.once("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Installer wizard failed (${code}):\n${output}`)),
    );
  });
  await Promise.race([watching, finished]);
  // Wrapped: an async function returning the promise itself would wait for it.
  return { finished };
}
/** Tab titles in the sidebar. */
async function tabTitles(shell: Page) {
  return shell.locator("nav[aria-label='Sidebar'] [data-tab-id]").allInnerTexts();
}
async function openTabs(shell: Page, feed: string) {
  for (const page of ["a", "b"]) {
    await shell.evaluate(
      (url) => window.chiaroscuro.sendCommand("tabs:create", { url }),
      `${feed}tab-${page}`,
    );
  }
  await waitUntil(
    "update test tabs",
    () => tabTitles(shell),
    (titles) => UPDATE_TABS.every((title) => titles.some((text) => text.includes(title))),
    30_000,
  );
}
const UPDATE_TABS = ["Update tab A", "Update tab B"];
/** Record each update error the shell shows, so repeated identical errors are counted. */
async function recordUpdateErrors(shell: Page) {
  await shell.evaluate(() => {
    const shown: string[] = [];
    let current: Element | null = null;
    new MutationObserver(() => {
      const alert = document.querySelector("[role='alert']");
      if (alert && alert !== current) shown.push(alert.textContent ?? "");
      current = alert;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    (window as unknown as { updateErrors: string[] }).updateErrors = shown;
  });
}
function restartButton(shell: Page) {
  return shell.getByRole("button", { name: "Restart to apply update", exact: true });
}
/** Restart with an installer that cannot start: the browser keeps running, its tabs and Restart. */
async function failedRestart(alive: () => boolean, shell: Page, name: string) {
  const errors = () =>
    shell.evaluate(() => (window as unknown as { updateErrors: string[] }).updateErrors.length);
  const before = await errors();
  await restartButton(shell).click();
  const outcome = await waitUntil(
    `${name} restart outcome`,
    async () => (alive() ? await errors() : "quit"),
    (value) => value === "quit" || value > before,
    90_000,
  ).catch((error) => {
    desktopScreenshot(`update-${name}.timeout`);
    throw error;
  });
  desktopScreenshot(`update-${name}`);
  assert.notEqual(outcome, "quit", `The browser quit although the installer was ${name}`);
  const message = await shell.getByRole("alert").innerText();
  step(`Restart with the installer ${name}: ${message}`);
  await waitUntil(
    "Restart available again",
    () => restartButton(shell).isEnabled(),
    Boolean,
    10_000,
  );
  const titles = await tabTitles(shell);
  for (const title of UPDATE_TABS)
    assert.ok(
      titles.some((text) => text.includes(title)),
      `${title} missing: ${titles.join(", ")}`,
    );
  assert.ok(alive());
  return message;
}

// Record what the desktop shows before the step's time limit ends the run without artifacts.
setTimeout(() => {
  step("Verification timed out");
  try {
    desktopScreenshot("timeout");
    step(JSON.stringify(processes("early-access"), null, 2));
  } finally {
    process.exit(1);
  }
}, 10 * 60_000).unref();
const feed = await serveUpdateFeed(path.resolve("dist/early-access"), (line) =>
  appendFileSync(path.join(artifacts, "update-feed.log"), `${line}\n`),
);
try {
  install("early-access", "99.1.0-beta.1");
  assert.equal(installedVersion("early-access"), "99.1.0-beta.1");
  // The feed serves the newest packaged build, beta.2. Early Access finds it on its first
  // check, a few seconds after starting.
  serveUpdatesFrom("early-access", feed.url);
  const updating = await startDetached("early-access");
  await openTabs(updating.shell, feed.url);
  await restartButton(updating.shell).waitFor({ timeout: 180_000 });
  await recordUpdateErrors(updating.shell);

  // Restart with the downloaded installer missing, not executable and blocked: each time the
  // browser keeps running with its tabs and shows the error.
  const installer = pendingInstaller("early-access");
  renameSync(installer, `${installer}.away`);
  await failedRestart(updating.alive, updating.shell, "missing");
  writeFileSync(installer, "This is not an installer.\r\n");
  await failedRestart(updating.alive, updating.shell, "not-executable");
  rmSync(installer);
  renameSync(`${installer}.away`, installer);
  execFileSync("icacls.exe", [installer, "/deny", "*S-1-1-0:(X)"]);
  await failedRestart(updating.alive, updating.shell, "blocked");
  execFileSync("icacls.exe", [installer, "/remove:d", "*S-1-1-0"]);

  // With the installer back, Restart starts it and only then does the browser quit.
  await updating.shell.screenshot({ path: path.join(artifacts, "update-before-restart.png") });
  step("Restarting with the installer back");
  await restartButton(updating.shell)
    .click({ noWaitAfter: true })
    // The browser may quit before the click completes.
    .catch((error) => step(`Restart click: ${error}`));
  const exitCode = await Promise.race([
    updating.exited,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 60_000)),
  ]);
  if (exitCode === "timeout") {
    desktopScreenshot("update-restart.timeout");
    throw new Error("The browser did not quit after starting the update installer");
  }
  step(`Browser quit with exit code ${exitCode}`);
  // Act as the user only now: the installer asks to close a browser that is still running.
  // It waits on its first page meanwhile.
  step(await (await watchInstaller(installer)).finished);

  // The installer starts the new version once it finished.
  const relaunched = await waitUntil(
    "updated browser",
    async () =>
      processes("early-access").filter(
        (entry) =>
          entry.ExecutablePath?.toLowerCase() === executable("early-access").toLowerCase() &&
          !entry.CommandLine?.includes("--type="),
      ),
    (list) => list.length > 0,
    60_000,
  );
  step(`Relaunched after update: ${JSON.stringify(relaunched)}`);
  assert.ok(relaunched.some((entry) => entry.CommandLine?.includes("--updated")));
  assert.equal(installedVersion("early-access"), "99.1.0-beta.2");
  desktopScreenshot("update-relaunched");
  await stop("early-access");
  const updated = await launch("early-access");
  assert.equal(updated.info.version, "99.1.0-beta.2");
  const titles = await tabTitles(updated.window);
  for (const title of UPDATE_TABS)
    assert.ok(
      titles.some((text) => text.includes(title)),
      `${title} missing: ${titles.join(", ")}`,
    );
  await close(updated.app);
  console.log("Restart to update installs the new version only once its installer starts.");
} finally {
  for (const { child, browser } of detached) {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill();
  }
  for (const app of running) {
    // A browser that does not quit in time is left to the runner's cleanup.
    await Promise.race([
      close(app),
      new Promise((_, reject) => setTimeout(() => reject(new Error("close timed out")), 30_000)),
    ]).catch((error) => {
      console.error(error);
      app.process().kill();
    });
  }
  await feed.close();
}
