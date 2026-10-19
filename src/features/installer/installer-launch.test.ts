import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallerLauncher, type InstallingUpdater } from "./installer-launch";

// The real electron-updater, as packaged builds use it on Windows. Its CommonJS modules look up
// child_process.spawn on every call, so spying on the shared module object replaces it.
const require = createRequire(import.meta.url);
const { NsisUpdater } = require("electron-updater") as typeof import("electron-updater");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const RESOURCES = join(tmpdir(), "chiaroscuro-test-resources");
const ELEVATE = join(RESOURCES, "elevate.exe");

interface Harness {
  updater: InstanceType<typeof NsisUpdater>;
  launcher: InstallerLauncher;
  openPath: ReturnType<typeof vi.fn<(path: string) => Promise<void>>>;
  quit: () => void;
  errors: unknown[];
}

function createHarness(installerPath: string | null): Harness {
  let onQuit: ((exitCode: number) => void) | undefined;
  const updater = new NsisUpdater(null, {
    version: "1.0.0",
    name: "Chiaroscuro",
    isPackaged: true,
    appUpdateConfigPath: "",
    userDataPath: "",
    baseCachePath: "",
    whenReady: async () => {},
    relaunch: () => {},
    quit: () => {},
    onQuit: (handler) => {
      onQuit = handler;
    },
  });
  updater.logger = null;
  updater.autoInstallOnAppQuit = true;
  // What a finished download leaves behind.
  // biome-ignore lint/suspicious/noExplicitAny: electron-updater internals
  const internals = updater as any;
  internals.downloadedUpdateHelper = installerPath && {
    file: installerPath,
    packageFile: null,
    downloadedFileInfo: { isAdminRightsRequired: false },
  };
  internals.addQuitHandler();
  const openPath = vi.fn<(path: string) => Promise<void>>(async () => {});
  const launcher = new InstallerLauncher(updater as unknown as InstallingUpdater, openPath);
  const errors: unknown[] = [];
  // As the installer feature does.
  updater.on("error", (error) => {
    if (!launcher.fail(error)) errors.push(error);
  });
  return { updater, launcher, openPath, quit: () => onQuit?.(0), errors };
}

/**
 * What Node's spawn returns: a process id once started, otherwise an error event. A started
 * process exits with the given exit code, or 0 (elevate.exe's result).
 */
function fakeChild(code?: string | number) {
  const child = Object.assign(new EventEmitter(), {
    pid: typeof code === "string" ? undefined : 4242,
    unref: () => {},
  });
  process.nextTick(() => {
    if (typeof code === "string")
      child.emit("error", Object.assign(new Error(`spawn ${code}`), { code }));
    else child.emit("exit", code ?? 0, null);
  });
  return child as unknown as ReturnType<typeof childProcess.spawn>;
}

beforeEach(() => {
  process.resourcesPath = RESOURCES;
});

afterEach(() => {
  vi.restoreAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: not set outside Electron
  delete (process as any).resourcesPath;
});

describe("InstallerLauncher with electron-updater", () => {
  const INSTALLER = join(tmpdir(), "Chiaroscuro-Setup-2.0.0.exe");

  function mockSpawn(...codes: (string | number | undefined)[]) {
    const spawn = vi.spyOn(childProcess, "spawn");
    for (const code of codes) spawn.mockImplementationOnce(() => fakeChild(code));
    return spawn;
  }

  it("resolves once the installer started, and quitting does not start it again", async () => {
    const spawn = mockSpawn(undefined);
    const { launcher, quit } = createHarness(INSTALLER);

    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0]?.[0]).toBe(INSTALLER);
    expect(spawn.mock.calls[0]?.[1]).toEqual(["--updated", "--force-run"]);

    quit();
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("resolves when an installer that needs elevation starts through elevate.exe", async () => {
    const spawn = mockSpawn("EACCES", undefined);
    const { launcher, openPath } = createHarness(INSTALLER);

    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1]?.[0]).toBe(ELEVATE);
    expect(spawn.mock.calls[1]?.[1]?.[0]).toBe(INSTALLER);
    expect(openPath).not.toHaveBeenCalled();
  });

  it("rejects when elevate.exe could not start the installer", async () => {
    mockSpawn("EACCES", 1223);
    const { launcher, errors } = createHarness(INSTALLER);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer did not start with administrator rights.",
    );
    expect(errors).toEqual([]);
  });

  it("rejects when neither the installer nor elevate.exe starts, and can retry", async () => {
    const spawn = mockSpawn("UNKNOWN", "EPERM", undefined);
    const { launcher, errors } = createHarness(INSTALLER);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer was blocked from starting.",
    );
    expect(errors).toEqual([]);

    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(3);
  });

  it("rejects when the installer is blocked", async () => {
    mockSpawn("EPERM");
    const { launcher, errors } = createHarness(INSTALLER);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer was blocked from starting.",
    );
    expect(errors).toEqual([]);
  });

  it("names other process start errors by their code", async () => {
    mockSpawn("EBUSY");
    const { launcher } = createHarness(INSTALLER);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer could not start (EBUSY).",
    );
  });

  it("opens an installer that cannot be spawned with the shell and resolves once it opened", async () => {
    const spawn = mockSpawn("ENOENT");
    const { launcher, openPath } = createHarness(INSTALLER);

    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(openPath).toHaveBeenCalledExactlyOnceWith(INSTALLER);
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("does not end a launch for errors of other updater work", async () => {
    mockSpawn("ENOENT");
    const { updater, launcher, openPath, errors } = createHarness(INSTALLER);
    const opened = Promise.withResolvers<void>();
    openPath.mockReturnValueOnce(opened.promise);

    const launching = launcher.launch();
    await vi.waitFor(() => expect(openPath).toHaveBeenCalledOnce());
    const networkError = new Error("Network error");
    updater.emit("error", networkError);
    opened.resolve();

    await expect(launching).resolves.toBeUndefined();
    expect(errors).toEqual([networkError]);
  });

  it("follows a launch in progress after teardown, so quitting does not install again", async () => {
    const spawn = mockSpawn("EACCES", undefined);
    const { updater, launcher, quit } = createHarness(INSTALLER);

    const launching = launcher.launch();
    launcher.dispose();
    await expect(launching).resolves.toBeUndefined();
    expect(spawn.mock.calls[1]?.[0]).toBe(ELEVATE);
    // biome-ignore lint/suspicious/noExplicitAny: electron-updater internals
    expect(Object.hasOwn(updater as any, "spawnLog")).toBe(false);

    quit();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("rejects when the installer is missing and leaves it to install on quit", async () => {
    const spawn = mockSpawn("ENOENT", undefined);
    const { launcher, openPath, quit } = createHarness(INSTALLER);
    openPath.mockRejectedValueOnce(new Error("The system cannot find the file specified."));

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer is missing or could not be opened.",
    );
    expect(openPath).toHaveBeenCalledOnce();

    // The update is still pending, so quitting tries it once more, silently.
    quit();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1]?.[1]).toContain("/S");
  });

  it("rejects without a downloaded update", async () => {
    const spawn = mockSpawn();
    const { launcher, errors } = createHarness(null);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer could not start: No update filepath provided, can't quit and install",
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it("shares one launch between overlapping and later requests", async () => {
    const spawn = mockSpawn(undefined);
    const { launcher } = createHarness(INSTALLER);

    await Promise.all([launcher.launch(), launcher.launch()]);
    // Once started, the browser is quitting: a late request does not fail.
    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("reports errors outside a launch to the updater's other listeners", async () => {
    const { updater, launcher, errors } = createHarness(INSTALLER);
    const error = new Error("Network error");
    updater.emit("error", error);
    expect(errors).toEqual([error]);
    launcher.dispose();
    // biome-ignore lint/suspicious/noExplicitAny: electron-updater internals
    expect(Object.hasOwn(updater as any, "spawnLog")).toBe(false);
  });
});

// Starts real, harmless processes in a temporary directory in place of the installer.
describe.skipIf(process.platform === "win32")("InstallerLauncher starting processes", () => {
  let dir: string;
  let marker: string;

  function script(name: string, mode: number, exitCode = 0) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\necho "$0 $*" > "${marker}"\nexit ${exitCode}\n`);
    chmodSync(file, mode);
    return file;
  }

  async function waitForMarker() {
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true));
    return readFileSync(marker, "utf8");
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chiaroscuro-installer-"));
    marker = join(dir, "ran");
    process.resourcesPath = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves after the installer process started", async () => {
    const installer = script("Setup.exe", 0o755);
    const { launcher } = createHarness(installer);

    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(await waitForMarker()).toContain("--updated");
  });

  it("starts an installer it may not run through elevate.exe", async () => {
    const installer = script("Setup.exe", 0o644);
    script("elevate.exe", 0o755);
    const { launcher } = createHarness(installer);

    await expect(launcher.launch()).resolves.toBeUndefined();
    expect(await waitForMarker()).toContain(`elevate.exe ${installer} --updated`);
  });

  it("rejects when the installer was removed", async () => {
    const { launcher, openPath } = createHarness(join(dir, "Setup.exe"));
    openPath.mockRejectedValueOnce(new Error("Failed to open path"));

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer is missing or could not be opened.",
    );
  });

  it("rejects when elevate.exe exits without starting the installer", async () => {
    const installer = script("Setup.exe", 0o644);
    script("elevate.exe", 0o755, 1);
    const { launcher } = createHarness(installer);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer did not start with administrator rights.",
    );
    expect(await waitForMarker()).toContain("elevate.exe");
  });

  it("rejects when neither the installer nor elevate.exe may run", async () => {
    const installer = script("Setup.exe", 0o644);
    script("elevate.exe", 0o644);
    const { launcher } = createHarness(installer);

    await expect(launcher.launch()).rejects.toThrow(
      "The update installer was blocked from starting.",
    );
    expect(existsSync(marker)).toBe(false);
  });
});
