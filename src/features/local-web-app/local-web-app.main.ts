import { type ChildProcess, execSync, spawn } from "node:child_process";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import type { TabId } from "../../shared/types";
import type { TabsEvents } from "../tabs/tabs.shared";
import { TABS_ACTIVATED, TABS_CLOSED } from "../tabs/tabs.shared";
import type { TerminalCommands } from "../terminal/terminal.shared";
import { TERMINAL_WRITE } from "../terminal/terminal.shared";
import {
  LOCAL_WEB_APP_BROWSE_DIRECTORY,
  LOCAL_WEB_APP_CONFIG_CHANGED,
  LOCAL_WEB_APP_CONFIG_REMOVED,
  LOCAL_WEB_APP_DELETE_CONFIG,
  LOCAL_WEB_APP_GET_CONFIG,
  LOCAL_WEB_APP_SAVE_CONFIG,
  LOCAL_WEB_APP_START,
  LOCAL_WEB_APP_STATUS_CHANGED,
  LOCAL_WEB_APP_STOP,
  type LocalWebAppCommands,
  type LocalWebAppConfig,
  type LocalWebAppEvents,
  type LocalWebAppStatus,
} from "./local-web-app.shared";

interface PersistedConfig {
  id: string;
  directory: string;
  command: string;
}

interface RunningProcess {
  proc: ChildProcess;
  tabId: TabId;
}

type AllCommands = LocalWebAppCommands & Pick<TerminalCommands, typeof TERMINAL_WRITE>;
type AllEvents = LocalWebAppEvents & Pick<TabsEvents, typeof TABS_CLOSED | typeof TABS_ACTIVATED>;

export interface LocalWebAppDeps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveTabId: () => TabId | undefined;
}

const configs = new Map<TabId, LocalWebAppConfig>();
const statuses = new Map<TabId, LocalWebAppStatus>();
const processes = new Map<TabId, RunningProcess>();
const reloadTimeouts = new Map<TabId, ReturnType<typeof setTimeout>>();
let collection: Collection<PersistedConfig>;

const RELOAD_DELAY_MS = 2000;

function killProcess(tabId: TabId): void {
  const pendingReload = reloadTimeouts.get(tabId);
  if (pendingReload) {
    clearTimeout(pendingReload);
    reloadTimeouts.delete(tabId);
  }

  const running = processes.get(tabId);
  if (!running) return;

  const pid = running.proc.pid;
  if (pid) {
    try {
      if (process.platform === "win32") {
        // taskkill /T kills the entire process tree on Windows
        execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
      } else {
        // Kill the process group (negative pid) on unix
        process.kill(-pid, "SIGTERM");
      }
    } catch {
      try {
        running.proc.kill("SIGTERM");
      } catch {
        // already dead
      }
    }
  }
  processes.delete(tabId);
}

function startProcess(deps: LocalWebAppDeps, tabId: TabId): void {
  const config = configs.get(tabId);
  if (!config) return;

  // Kill existing if running
  killProcess(tabId);

  const { commands, events, platform } = deps;

  // WSL UNC paths (\\wsl.localhost\Distro\path) must run inside WSL via wsl.exe,
  // because mapped network drives break fs.watch (EISDIR errors in Vite etc.).
  const wslMatch =
    process.platform === "win32"
      ? config.directory.match(/^\\\\wsl\.localhost\\([^\\]+)\\(.+)$/)
      : null;

  let proc: ChildProcess;
  if (wslMatch) {
    const distro = wslMatch[1] as string;
    const linuxPath = `/${(wslMatch[2] as string).replace(/\\/g, "/")}`;
    const escapedLinuxPath = linuxPath.replace(/'/g, "'\\''");
    // wsl.exe inherits Windows PATH where Windows-installed tools (e.g. npm's bun)
    // shadow WSL-native ones, breaking shim resolution. Fix: look up the user's
    // default shell and run it interactively so rc files set PATH correctly.
    // Explicit cd handles rc files that override the working directory.
    const escaped = config.command.replace(/'/g, "'\\''");
    const shellCmd = `exec $(getent passwd $(id -un) | cut -d: -f7) -ic 'cd "${escapedLinuxPath}" && ${escaped}'`;
    proc = spawn("wsl.exe", ["-d", distro, "--", "sh", "-c", shellCmd], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    proc = spawn(config.command, {
      cwd: config.directory,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32", // process group for tree-kill on unix
    });
  }

  processes.set(tabId, { proc, tabId });
  statuses.set(tabId, "running");
  events.emit(LOCAL_WEB_APP_STATUS_CHANGED, { tabId, status: "running" });

  proc.stdout?.on("data", (chunk: Buffer) => {
    commands
      .send(TERMINAL_WRITE, { tabId, data: chunk.toString(), type: "stdout" })
      .catch(console.error);
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    commands
      .send(TERMINAL_WRITE, { tabId, data: chunk.toString(), type: "stderr" })
      .catch(console.error);
  });

  proc.on("close", (code) => {
    if (processes.get(tabId)?.proc !== proc) return;
    const pendingReload = reloadTimeouts.get(tabId);
    if (pendingReload) {
      clearTimeout(pendingReload);
      reloadTimeouts.delete(tabId);
    }
    processes.delete(tabId);
    const status: LocalWebAppStatus = code === 0 || code === null ? "stopped" : "error";
    statuses.set(tabId, status);
    events.emit(LOCAL_WEB_APP_STATUS_CHANGED, { tabId, status });
  });

  proc.on("error", (err) => {
    if (processes.get(tabId)?.proc !== proc) return;
    const pendingReload = reloadTimeouts.get(tabId);
    if (pendingReload) {
      clearTimeout(pendingReload);
      reloadTimeouts.delete(tabId);
    }
    processes.delete(tabId);
    statuses.set(tabId, "error");
    events.emit(LOCAL_WEB_APP_STATUS_CHANGED, { tabId, status: "error" });
    commands
      .send(TERMINAL_WRITE, { tabId, data: `Error: ${err.message}`, type: "stderr" })
      .catch(console.error);
  });

  // Reload tab after a short delay to let the server start
  const timeoutId = setTimeout(() => {
    reloadTimeouts.delete(tabId);
    platform.reload(tabId);
  }, RELOAD_DELAY_MS);
  reloadTimeouts.set(tabId, timeoutId);
}

export function register(deps: LocalWebAppDeps): void {
  const { commands, events, platform, dataStore } = deps;
  collection = dataStore.collection<PersistedConfig>("local-web-app-configs");

  commands.handle(LOCAL_WEB_APP_SAVE_CONFIG, async ({ tabId, directory, command }) => {
    const config: LocalWebAppConfig = { directory, command };
    configs.set(tabId, config);
    collection.upsert({ id: tabId, directory, command }).catch(console.error);
    events.emit(LOCAL_WEB_APP_CONFIG_CHANGED, { tabId, config });

    // Only restart if this is the active tab
    if (deps.getActiveTabId() === tabId) {
      startProcess(deps, tabId);
    }
  });

  commands.handle(LOCAL_WEB_APP_DELETE_CONFIG, async ({ tabId }) => {
    killProcess(tabId);
    configs.delete(tabId);
    statuses.delete(tabId);
    collection.remove(tabId).catch(console.error);
    events.emit(LOCAL_WEB_APP_CONFIG_REMOVED, { tabId });
    events.emit(LOCAL_WEB_APP_STATUS_CHANGED, { tabId, status: "stopped" });
  });

  commands.handle(LOCAL_WEB_APP_START, async ({ tabId }) => {
    startProcess(deps, tabId);
  });

  commands.handle(LOCAL_WEB_APP_STOP, async ({ tabId }) => {
    killProcess(tabId);
    statuses.set(tabId, "stopped");
    events.emit(LOCAL_WEB_APP_STATUS_CHANGED, { tabId, status: "stopped" });
  });

  commands.handle(LOCAL_WEB_APP_BROWSE_DIRECTORY, async () => {
    const paths = await platform.showOpenDialog({
      title: "Select project directory",
      properties: ["openDirectory"],
    });
    return paths[0];
  });

  commands.handle(LOCAL_WEB_APP_GET_CONFIG, async ({ tabId }) => {
    const config = configs.get(tabId);
    if (!config) return undefined;
    return { ...config, status: statuses.get(tabId) ?? "stopped" };
  });

  // Auto-start on tab activation
  events.on(TABS_ACTIVATED, ({ tabId }) => {
    if (!tabId) return;
    const config = configs.get(tabId);
    if (config && !processes.has(tabId)) {
      startProcess(deps, tabId);
    }
  });

  // Clean up on tab close
  events.on(TABS_CLOSED, ({ tabId }) => {
    killProcess(tabId);
    configs.delete(tabId);
    statuses.delete(tabId);
    collection.remove(tabId).catch(console.error);
  });
}

export async function start(
  deps: LocalWebAppDeps,
  restoredTabs?: { idMap: Map<TabId, TabId> },
): Promise<void> {
  const persisted = await collection.findMany({});
  for (const doc of persisted) {
    const oldId = doc.id as TabId;
    const tabId = restoredTabs?.idMap.get(oldId) ?? oldId;

    // Skip stale entries whose tab no longer exists after restore
    if (restoredTabs && tabId === oldId && !restoredTabs.idMap.has(oldId)) {
      collection.remove(oldId).catch(console.error);
      continue;
    }

    // Update persisted doc if ID changed
    if (tabId !== oldId) {
      collection
        .upsert({ id: tabId, directory: doc.directory, command: doc.command })
        .then(() => collection.remove(oldId))
        .catch(console.error);
    }

    configs.set(tabId, { directory: doc.directory, command: doc.command });
    statuses.set(tabId, "stopped");
    deps.events.emit(LOCAL_WEB_APP_CONFIG_CHANGED, {
      tabId,
      config: { directory: doc.directory, command: doc.command },
    });
    deps.events.emit(LOCAL_WEB_APP_STATUS_CHANGED, { tabId, status: "stopped" });
  }

  // Auto-start the active tab (TABS_ACTIVATED fired before configs were loaded)
  const activeTabId = deps.getActiveTabId();
  if (activeTabId && configs.has(activeTabId) && !processes.has(activeTabId)) {
    startProcess(deps, activeTabId);
  }
}

/** Stop all running processes (called on app quit). */
export function stopAll(): void {
  for (const tabId of processes.keys()) {
    killProcess(tabId);
  }
}

/** Reset module state (for tests). */
export function _reset(): void {
  stopAll();
  configs.clear();
  statuses.clear();
}
