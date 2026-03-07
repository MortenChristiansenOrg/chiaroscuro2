import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { TabsEvents } from "../tabs/tabs.shared";
import type { TerminalCommands } from "../terminal/terminal.shared";
import { TERMINAL_WRITE } from "../terminal/terminal.shared";
import type { LocalWebAppDeps } from "./local-web-app.main";
import feature from "./local-web-app.main";
import { _reset, start } from "./local-web-app.main";
import {
  LOCAL_WEB_APP_BROWSE_DIRECTORY,
  LOCAL_WEB_APP_CONFIG_CHANGED,
  LOCAL_WEB_APP_CONFIG_REMOVED,
  LOCAL_WEB_APP_DELETE_CONFIG,
  LOCAL_WEB_APP_GET_CONFIG,
  LOCAL_WEB_APP_SAVE_CONFIG,
  LOCAL_WEB_APP_STATUS_CHANGED,
  LOCAL_WEB_APP_STOP,
  type LocalWebAppCommands,
  type LocalWebAppConfigChangedEvent,
  type LocalWebAppEvents,
  type LocalWebAppStatusChangedEvent,
} from "./local-web-app.shared";

// Mock child_process.spawn to avoid actually spawning processes
vi.mock("node:child_process", () => {
  const EventEmitter = require("node:events");
  return {
    spawn: vi.fn(() => {
      const proc = new EventEmitter();
      proc.pid = 12345;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn(() => {
        // Simulate async close so killProcess resolves promptly
        queueMicrotask(() => proc.emit("close", 0));
      });
      return proc;
    }),
    execSync: vi.fn(),
  };
});

type AllCommands = LocalWebAppCommands & Pick<TerminalCommands, typeof TERMINAL_WRITE>;
type AllEvents = LocalWebAppEvents & Pick<TabsEvents, "tabs:closed" | "tabs:activated">;

async function setup() {
  _reset();
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform();
  const dataStore = new MemoryDataStore();
  await dataStore.initialize();
  const activeTabId = { current: "tab-1" as TabId };

  // Register terminal:write handler (mock)
  commands.handle(
    TERMINAL_WRITE,
    vi.fn(async () => {}),
  );

  const deps: LocalWebAppDeps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveTabId: () => activeTabId.current as TabId | undefined,
  };

  feature.register(deps);

  return { commands, events, platform, dataStore, deps, activeTabId };
}

describe("local-web-app feature", () => {
  describe("save-config", () => {
    it("persists config and emits config-changed", async () => {
      const { commands, events } = await setup();
      const handler = vi.fn();
      events.on(LOCAL_WEB_APP_CONFIG_CHANGED, handler);

      await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
        tabId: "tab-1" as TabId,
        directory: "/projects/myapp",
        command: "npm start",
      });

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-1",
        config: { directory: "/projects/myapp", command: "npm start" },
      } satisfies LocalWebAppConfigChangedEvent);
    });

    it("emits status running after save", async () => {
      const { commands, events } = await setup();
      const handler = vi.fn();
      events.on(LOCAL_WEB_APP_STATUS_CHANGED, handler);

      await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
        tabId: "tab-1" as TabId,
        directory: "/projects/myapp",
        command: "npm start",
      });

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-1",
        status: "running",
      } satisfies LocalWebAppStatusChangedEvent);
    });
  });

  describe("delete-config", () => {
    it("stops process and emits config-removed", async () => {
      const { commands, events } = await setup();
      const removedHandler = vi.fn();
      events.on(LOCAL_WEB_APP_CONFIG_REMOVED, removedHandler);

      // Save first
      await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
        tabId: "tab-1" as TabId,
        directory: "/projects/myapp",
        command: "npm start",
      });

      await commands.send(LOCAL_WEB_APP_DELETE_CONFIG, {
        tabId: "tab-1" as TabId,
      });

      expect(removedHandler).toHaveBeenCalledWith({ tabId: "tab-1" });
    });
  });

  describe("get-config", () => {
    it("returns undefined for unconfigured tab", async () => {
      const { commands } = await setup();
      const result = await commands.send(LOCAL_WEB_APP_GET_CONFIG, {
        tabId: "tab-1" as TabId,
      });
      expect(result).toBeUndefined();
    });

    it("returns config with status for configured tab", async () => {
      const { commands } = await setup();

      await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
        tabId: "tab-1" as TabId,
        directory: "/projects/myapp",
        command: "npm start",
      });

      const result = await commands.send(LOCAL_WEB_APP_GET_CONFIG, {
        tabId: "tab-1" as TabId,
      });

      expect(result).toEqual({
        directory: "/projects/myapp",
        command: "npm start",
        status: "running",
      });
    });
  });

  describe("browse-directory", () => {
    it("calls platform.showOpenDialog", async () => {
      const { commands, platform } = await setup();
      (platform.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue(["/selected/path"]);

      const result = await commands.send(LOCAL_WEB_APP_BROWSE_DIRECTORY, undefined);
      expect(result).toBe("/selected/path");
      expect(platform.showOpenDialog).toHaveBeenCalledWith({
        title: "Select project directory",
        properties: ["openDirectory"],
      });
    });
  });

  describe("stop", () => {
    it("emits stopped status", async () => {
      const { commands, events } = await setup();
      const handler = vi.fn();
      events.on(LOCAL_WEB_APP_STATUS_CHANGED, handler);

      // Save config first (starts process)
      await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
        tabId: "tab-1" as TabId,
        directory: "/projects/myapp",
        command: "npm start",
      });

      await commands.send(LOCAL_WEB_APP_STOP, { tabId: "tab-1" as TabId });

      const lastCall = handler.mock.calls[handler.mock.calls.length - 1][0];
      expect(lastCall).toEqual({ tabId: "tab-1", status: "stopped" });
    });
  });

  describe("WSL path support", () => {
    it("spawns via wsl.exe for WSL UNC paths on win32", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });

      try {
        const { commands } = await setup();
        (spawn as ReturnType<typeof vi.fn>).mockClear();

        await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
          tabId: "tab-1" as TabId,
          directory: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\user\\project",
          command: "bun dev",
        });

        expect(spawn).toHaveBeenCalledWith(
          "wsl.exe",
          ["-d", "Ubuntu-24.04", "--", "sh", "-c", expect.stringContaining("bun dev")],
          expect.objectContaining({ shell: false }),
        );
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });

    it("uses cwd normally for non-WSL paths on win32", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });

      try {
        const { commands } = await setup();
        (spawn as ReturnType<typeof vi.fn>).mockClear();

        await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
          tabId: "tab-1" as TabId,
          directory: "C:\\projects\\myapp",
          command: "npm start",
        });

        expect(spawn).toHaveBeenCalledWith(
          "npm start",
          expect.objectContaining({ cwd: "C:\\projects\\myapp", shell: true }),
        );
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });
  });

  describe("persistence", () => {
    it("restores configs from datastore on start", async () => {
      const { events, deps, dataStore } = await setup();

      // Manually insert config into datastore
      const collection = dataStore.collection("local-web-app-configs");
      await collection.upsert({
        id: "tab-1",
        directory: "/projects/myapp",
        command: "npm start",
      });

      const handler = vi.fn();
      events.on(LOCAL_WEB_APP_CONFIG_CHANGED, handler);

      await start(deps);

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-1",
        config: { directory: "/projects/myapp", command: "npm start" },
      });
    });

    it("restores persisted configs", async () => {
      const { events, deps, dataStore } = await setup();

      const collection = dataStore.collection("local-web-app-configs");
      await collection.upsert({
        id: "tab-2",
        directory: "/projects/myapp",
        command: "npm start",
      });

      const handler = vi.fn();
      events.on(LOCAL_WEB_APP_CONFIG_CHANGED, handler);

      await start(deps);

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-2",
        config: { directory: "/projects/myapp", command: "npm start" },
      });
    });

    it("auto-starts process for active tab on start", async () => {
      const { events, deps, dataStore, activeTabId } = await setup();
      activeTabId.current = "tab-2" as TabId;

      const collection = dataStore.collection("local-web-app-configs");
      await collection.upsert({
        id: "tab-2",
        directory: "/projects/myapp",
        command: "npm start",
      });

      const statusHandler = vi.fn();
      events.on(LOCAL_WEB_APP_STATUS_CHANGED, statusHandler);

      await start(deps);

      expect(statusHandler).toHaveBeenCalledWith({
        tabId: "tab-2",
        status: "running",
      });
    });
  });

  describe("tab close cleanup", () => {
    it("stops process and cleans up on tab close", async () => {
      const { commands, events } = await setup();

      await commands.send(LOCAL_WEB_APP_SAVE_CONFIG, {
        tabId: "tab-1" as TabId,
        directory: "/projects/myapp",
        command: "npm start",
      });

      const statusHandler = vi.fn();
      events.on(LOCAL_WEB_APP_STATUS_CHANGED, statusHandler);

      // Simulate tab close
      events.emit("tabs:closed", {
        tabId: "tab-1" as TabId,
        activatedTabId: null,
      });

      // Config should be gone
      const result = await commands.send(LOCAL_WEB_APP_GET_CONFIG, {
        tabId: "tab-1" as TabId,
      });
      expect(result).toBeUndefined();
    });
  });
});
