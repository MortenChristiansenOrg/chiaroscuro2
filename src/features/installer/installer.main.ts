import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import {
  INSTALLER_ALLOW_PROTOCOL,
  INSTALLER_APPLY_UPDATE,
  INSTALLER_CHECK_FOR_UPDATES,
  INSTALLER_DENY_PROTOCOL,
  INSTALLER_DISMISS_UPDATE,
  INSTALLER_PROTOCOL_ALLOWED,
  INSTALLER_PROTOCOL_LAUNCH_REQUESTED,
  INSTALLER_UPDATE_AVAILABLE,
  INSTALLER_UPDATE_DISMISSED,
  INSTALLER_UPDATE_DOWNLOADED,
  INSTALLER_UPDATE_ERROR,
  INSTALLER_UPDATE_NOT_AVAILABLE,
  type InstallerCommands,
  type InstallerEvents,
} from "./installer.shared";

type AllCommands = InstallerCommands;
type AllEvents = InstallerEvents;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  isDev: boolean;
}

const ALLOWED_PROTOCOLS_KEY = "installer:allowed-protocols";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const INITIAL_CHECK_DELAY_MS = 30_000; // 30 seconds

interface AllowedProtocolEntry {
  protocol: string;
  origin: string;
}

interface PendingRequest {
  protocol: string;
  origin: string;
  url: string;
}

let allowedProtocols: AllowedProtocolEntry[] = [];
const pendingRequests = new Map<string, PendingRequest>();
let nextRequestId = 0;
let checkTimer: ReturnType<typeof setInterval> | undefined;
let initialCheckTimer: ReturnType<typeof setTimeout> | undefined;
let stopProtocolListener: (() => void) | undefined;
let stopProtocolAllowedListener: (() => void) | undefined;

/** Make a key for protocol+origin lookups. */
function protocolKey(protocol: string, origin: string): string {
  return `${protocol}\0${origin}`;
}

export function register({ commands, events, platform, dataStore }: Deps): void {
  commands.handle(INSTALLER_CHECK_FOR_UPDATES, async () => {
    try {
      // Dynamic import to avoid loading electron-updater in tests
      const { autoUpdater } = await import("electron-updater");
      await autoUpdater.checkForUpdates();
    } catch (err) {
      events.emit(INSTALLER_UPDATE_ERROR, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  commands.handle(INSTALLER_APPLY_UPDATE, async () => {
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.quitAndInstall();
  });

  commands.handle(INSTALLER_DISMISS_UPDATE, async () => {
    events.emit(INSTALLER_UPDATE_DISMISSED, undefined);
  });

  commands.handle(INSTALLER_ALLOW_PROTOCOL, async ({ requestId, always }) => {
    const pending = pendingRequests.get(requestId);
    if (!pending) return; // No matching pending request — ignore
    pendingRequests.delete(requestId);

    const { protocol, origin, url } = pending;
    if (always) {
      const exists = allowedProtocols.some((e) => e.protocol === protocol && e.origin === origin);
      if (!exists) {
        allowedProtocols.push({ protocol, origin });
        void dataStore.setSetting(ALLOWED_PROTOCOLS_KEY, allowedProtocols).catch(console.error);
      }
    }
    events.emit(INSTALLER_PROTOCOL_ALLOWED, { protocol, origin, always });
    await platform.openExternalApproved(url);
  });

  commands.handle(INSTALLER_DENY_PROTOCOL, async ({ requestId }) => {
    pendingRequests.delete(requestId);
  });
}

export async function start({ events, platform, dataStore, isDev }: Deps): Promise<void> {
  // Load persisted allowed protocols
  const saved = await dataStore.getSetting<AllowedProtocolEntry[]>(ALLOWED_PROTOCOLS_KEY);
  if (saved) {
    allowedProtocols = saved;
  }

  // Listen for protocol navigations from web content
  const allowedSet = new Set(allowedProtocols.map((e) => protocolKey(e.protocol, e.origin)));

  stopProtocolListener = platform.onProtocolRequest((url, origin) => {
    try {
      const parsed = new URL(url);
      const proto = parsed.protocol.replace(/:$/, "");
      const key = protocolKey(proto, origin);
      if (allowedSet.has(key)) {
        // Auto-allow previously approved protocol+origin
        platform.openExternalApproved(url).catch(console.error);
      } else {
        const requestId = String(++nextRequestId);
        pendingRequests.set(requestId, { protocol: proto, origin, url });
        events.emit(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, {
          requestId,
          protocol: proto,
          origin,
          url,
        });
      }
    } catch {
      // Invalid URL — ignore
    }
  });

  // Keep allowedSet in sync when protocols are allowed
  stopProtocolAllowedListener = events.on(INSTALLER_PROTOCOL_ALLOWED, () => {
    allowedSet.clear();
    for (const e of allowedProtocols) {
      allowedSet.add(protocolKey(e.protocol, e.origin));
    }
  });

  // Skip auto-updater in dev mode
  if (isDev) return;

  try {
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      events.emit(INSTALLER_UPDATE_AVAILABLE, { version: info.version });
    });

    autoUpdater.on("update-downloaded", (info) => {
      events.emit(INSTALLER_UPDATE_DOWNLOADED, { version: info.version });
    });

    autoUpdater.on("update-not-available", () => {
      events.emit(INSTALLER_UPDATE_NOT_AVAILABLE, undefined);
    });

    autoUpdater.on("error", (err) => {
      events.emit(INSTALLER_UPDATE_ERROR, {
        message: err instanceof Error ? err.message : String(err),
      });
    });

    // Initial check after delay
    initialCheckTimer = setTimeout(() => {
      initialCheckTimer = undefined;
      autoUpdater.checkForUpdates().catch(console.error);
    }, INITIAL_CHECK_DELAY_MS);

    // Periodic checks
    checkTimer = setInterval(() => {
      autoUpdater.checkForUpdates().catch(console.error);
    }, CHECK_INTERVAL_MS);
  } catch (err) {
    console.error("[installer] Failed to initialize auto-updater:", err);
  }
}

export function stop(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = undefined;
  }
  if (initialCheckTimer) {
    clearTimeout(initialCheckTimer);
    initialCheckTimer = undefined;
  }
  if (stopProtocolListener) {
    stopProtocolListener();
    stopProtocolListener = undefined;
  }
  if (stopProtocolAllowedListener) {
    stopProtocolAllowedListener();
    stopProtocolAllowedListener = undefined;
  }
  allowedProtocols = [];
  pendingRequests.clear();
}
