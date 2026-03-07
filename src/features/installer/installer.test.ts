import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { createMockPlatform } from "../../test-utils";
import { register, start, stop } from "./installer.main";
import {
  INSTALLER_ALLOW_PROTOCOL,
  INSTALLER_APPLY_UPDATE,
  INSTALLER_CHECK_FOR_UPDATES,
  INSTALLER_DENY_PROTOCOL,
  INSTALLER_DISMISS_UPDATE,
  INSTALLER_PROTOCOL_LAUNCH_REQUESTED,
  INSTALLER_UPDATE_DISMISSED,
  INSTALLER_UPDATE_ERROR,
  type InstallerCommands,
  type InstallerEvents,
  type ProtocolLaunchRequestedEvent,
  type UpdateErrorEvent,
} from "./installer.shared";

type AllCommands = InstallerCommands;
type AllEvents = InstallerEvents;

// Mock electron-updater — dynamic import in installer.main.ts
vi.mock("electron-updater", () => {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => undefined),
      downloadUpdate: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(cb);
        listeners.set(event, list);
      }),
      // Test helper
      _emit(event: string, ...args: unknown[]) {
        for (const cb of listeners.get(event) ?? []) cb(...args);
      },
      _reset() {
        listeners.clear();
      },
    },
  };
});

interface MockDataStore {
  getSetting: ReturnType<typeof vi.fn>;
  setSetting: ReturnType<typeof vi.fn>;
  collection: ReturnType<typeof vi.fn>;
  initialize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockDataStore(): MockDataStore {
  return {
    getSetting: vi.fn(async () => null),
    setSetting: vi.fn(async () => undefined),
    collection: vi.fn(),
    initialize: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

let protocolCallback: ((url: string, origin: string) => void) | undefined;

function setup(overrides: { isDev?: boolean } = {}) {
  protocolCallback = undefined;
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform({
    onProtocolRequest: vi.fn((cb: (url: string, origin: string) => void) => {
      protocolCallback = cb;
      return () => {
        protocolCallback = undefined;
      };
    }),
  });
  const dataStore = createMockDataStore();
  const deps = {
    commands,
    events,
    platform,
    dataStore,
    isDev: overrides.isDev ?? true,
  };
  register(deps);
  return { commands, events, platform, dataStore, deps };
}

describe("installer feature", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    stop();
    const { autoUpdater } = await import("electron-updater");
    // biome-ignore lint/suspicious/noExplicitAny: test mock helper
    (autoUpdater as any)._reset?.();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("protocol handling", () => {
    it("registers onProtocolRequest callback on start", async () => {
      const { deps } = setup();
      await start(deps);
      expect(deps.platform.onProtocolRequest).toHaveBeenCalledOnce();
    });

    it("emits protocol-launch-requested for unknown protocol+origin", async () => {
      const { deps, events } = setup();
      await start(deps);

      const onRequested = vi.fn();
      events.on(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, onRequested);

      protocolCallback?.("slack://open/channel", "https://example.com");

      expect(onRequested).toHaveBeenCalledOnce();
      const payload = onRequested.mock.calls[0][0] as ProtocolLaunchRequestedEvent;
      expect(payload.requestId).toBeDefined();
      expect(payload.protocol).toBe("slack");
      expect(payload.origin).toBe("https://example.com");
      expect(payload.url).toBe("slack://open/channel");
    });

    it("auto-allows previously persisted protocol+origin", async () => {
      const { deps, dataStore, platform } = setup();
      dataStore.getSetting.mockResolvedValueOnce([
        { protocol: "slack", origin: "https://example.com" },
      ]);

      await start(deps);

      protocolCallback?.("slack://open/channel", "https://example.com");

      expect(platform.openExternalApproved).toHaveBeenCalledWith("slack://open/channel");
    });

    it("does not auto-allow different origin", async () => {
      const { deps, events, dataStore, platform } = setup();
      dataStore.getSetting.mockResolvedValueOnce([
        { protocol: "slack", origin: "https://trusted.com" },
      ]);

      await start(deps);

      const onRequested = vi.fn();
      events.on(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, onRequested);

      protocolCallback?.("slack://open", "https://untrusted.com");

      expect(platform.openExternalApproved).not.toHaveBeenCalled();
      expect(onRequested).toHaveBeenCalledOnce();
    });

    it("allow-protocol command opens external using stored pending request", async () => {
      const { commands, deps, events, dataStore, platform } = setup();
      await start(deps);

      // Trigger a protocol request to create a pending entry
      const onRequested = vi.fn();
      events.on(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, onRequested);
      protocolCallback?.("slack://open", "https://example.com");
      const { requestId } = onRequested.mock.calls[0][0] as ProtocolLaunchRequestedEvent;

      await commands.send(INSTALLER_ALLOW_PROTOCOL, { requestId, always: true });

      expect(platform.openExternalApproved).toHaveBeenCalledWith("slack://open");
      expect(dataStore.setSetting).toHaveBeenCalledWith(
        "installer:allowed-protocols",
        expect.arrayContaining([{ protocol: "slack", origin: "https://example.com" }]),
      );
    });

    it("allow-protocol command opens external without persisting if always=false", async () => {
      const { commands, deps, events, dataStore, platform } = setup();
      await start(deps);

      const onRequested = vi.fn();
      events.on(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, onRequested);
      protocolCallback?.("slack://open", "https://example.com");
      const { requestId } = onRequested.mock.calls[0][0] as ProtocolLaunchRequestedEvent;

      await commands.send(INSTALLER_ALLOW_PROTOCOL, { requestId, always: false });

      expect(platform.openExternalApproved).toHaveBeenCalledWith("slack://open");
      expect(dataStore.setSetting).not.toHaveBeenCalled();
    });

    it("allow-protocol ignores unknown requestId", async () => {
      const { commands, deps, platform } = setup();
      await start(deps);

      await commands.send(INSTALLER_ALLOW_PROTOCOL, { requestId: "bogus", always: false });

      expect(platform.openExternalApproved).not.toHaveBeenCalled();
    });

    it("deny-protocol clears pending request", async () => {
      const { commands, deps, events, platform } = setup();
      await start(deps);

      const onRequested = vi.fn();
      events.on(INSTALLER_PROTOCOL_LAUNCH_REQUESTED, onRequested);
      protocolCallback?.("slack://open", "https://example.com");
      const { requestId } = onRequested.mock.calls[0][0] as ProtocolLaunchRequestedEvent;

      await commands.send(INSTALLER_DENY_PROTOCOL, { requestId });

      // After deny, approving the same requestId should be a no-op
      await commands.send(INSTALLER_ALLOW_PROTOCOL, { requestId, always: false });
      expect(platform.openExternalApproved).not.toHaveBeenCalled();
    });
  });

  describe("dismiss update", () => {
    it("emits update-dismissed event", async () => {
      const { commands, deps, events } = setup();
      await start(deps);

      const onDismissed = vi.fn();
      events.on(INSTALLER_UPDATE_DISMISSED, onDismissed);

      await commands.send(INSTALLER_DISMISS_UPDATE, undefined);

      expect(onDismissed).toHaveBeenCalledOnce();
    });
  });

  describe("auto-updater", () => {
    it("skips auto-updater in dev mode", async () => {
      const { deps } = setup({ isDev: true });
      await start(deps);

      const { autoUpdater } = await import("electron-updater");
      expect(autoUpdater.on).not.toHaveBeenCalled();
    });

    it("triggers download when update is available", async () => {
      const { deps } = setup({ isDev: false });
      await start(deps);

      const { autoUpdater } = await import("electron-updater");
      // biome-ignore lint/suspicious/noExplicitAny: test mock helper
      (autoUpdater as any)._emit("update-available", { version: "1.0.0" });

      expect(autoUpdater.downloadUpdate).toHaveBeenCalledOnce();
    });

    it("schedules initial check after delay", async () => {
      const { deps } = setup({ isDev: false });
      await start(deps);

      const { autoUpdater } = await import("electron-updater");
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3_000);
      expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });
  });

  describe("auto-updater commands", () => {
    it("check-for-updates command calls autoUpdater.checkForUpdates", async () => {
      const { commands, deps } = setup({ isDev: false });
      await start(deps);

      const { autoUpdater } = await import("electron-updater");
      await commands.send(INSTALLER_CHECK_FOR_UPDATES, undefined);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it("check-for-updates emits error event on failure via error listener", async () => {
      const { deps, events } = setup({ isDev: false });
      await start(deps);

      const { autoUpdater } = await import("electron-updater");

      const onError = vi.fn();
      events.on(INSTALLER_UPDATE_ERROR, onError);

      // electron-updater emits "error" for download/check failures
      // biome-ignore lint/suspicious/noExplicitAny: test mock helper
      (autoUpdater as any)._emit("error", new Error("Network error"));

      expect(onError).toHaveBeenCalledOnce();
      expect((onError.mock.calls[0][0] as UpdateErrorEvent).message).toBe("Network error");
    });

    it("check-for-updates emits error if auto-updater not initialized", async () => {
      const { commands, deps, events } = setup({ isDev: true });
      await start(deps); // isDev=true skips auto-updater init

      const onError = vi.fn();
      events.on(INSTALLER_UPDATE_ERROR, onError);

      await commands.send(INSTALLER_CHECK_FOR_UPDATES, undefined);

      expect(onError).toHaveBeenCalledOnce();
      expect((onError.mock.calls[0][0] as UpdateErrorEvent).message).toBe(
        "Auto-updater not initialized",
      );
    });

    it("apply-update command calls autoUpdater.quitAndInstall", async () => {
      const { commands, deps } = setup({ isDev: false });
      await start(deps);

      const { autoUpdater } = await import("electron-updater");
      await commands.send(INSTALLER_APPLY_UPDATE, undefined);

      expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("stop() cleans up protocol listener", async () => {
      const { deps } = setup();
      await start(deps);

      expect(protocolCallback).toBeDefined();
      stop();
      expect(protocolCallback).toBeUndefined();
    });
  });
});
