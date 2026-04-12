import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { Platform } from "../../platform/types";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { TabsClosedEvent, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import feature from "./extensions.main";
import {
  EXTENSIONS_CHANGED,
  EXTENSIONS_INSTALL,
  EXTENSIONS_INSTALL_COMPLETED,
  EXTENSIONS_INSTALL_FAILED,
  EXTENSIONS_INSTALL_STARTED,
  EXTENSIONS_OPEN,
  EXTENSIONS_SET_ENABLED,
  EXTENSIONS_UNINSTALL,
  type ExtensionsChangedEvent,
  type ExtensionsCommands,
  type ExtensionsEvents,
  type InstalledExtension,
} from "./extensions.shared";

type AllCommands = ExtensionsCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = ExtensionsEvents & Pick<TabsEvents, "tabs:closed">;

function setup(platformOverrides?: Partial<Platform>) {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const platform = createMockPlatform(platformOverrides);

  const deps = { commands, events, dataStore, platform };

  commands.handle("tabs:create", async (payload) => {
    return `mock-tab-${payload.url}` as TabId;
  });
  commands.handle("tabs:activate", async () => {});

  feature.register(deps);
  return { commands, events, dataStore, platform, deps };
}

describe("extensions commands", () => {
  describe("EXTENSIONS_OPEN", () => {
    it("creates a built-in tab via tabs:create", async () => {
      const { commands } = setup();
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "ext-tab-1" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(EXTENSIONS_OPEN, undefined);

      expect(createSpy).toHaveBeenCalledWith({ url: "/extensions" });
    });

    it("reactivates existing extensions tab (singleton)", async () => {
      const { commands } = setup();
      await commands.send(EXTENSIONS_OPEN, undefined);

      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "ext-tab-2" as TabId);
      commands.handle("tabs:create", createSpy);
      commands.unhandle("tabs:activate");
      const activateSpy = vi.fn(async () => {});
      commands.handle("tabs:activate", activateSpy);

      await commands.send(EXTENSIONS_OPEN, undefined);
      expect(activateSpy).toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("creates new tab if singleton tab was closed", async () => {
      const { commands, events } = setup();
      await commands.send(EXTENSIONS_OPEN, undefined);

      events.emit("tabs:closed", {
        tabId: "mock-tab-/extensions" as TabId,
        activatedTabId: null,
      } as TabsClosedEvent);

      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "ext-tab-3" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(EXTENSIONS_OPEN, undefined);
      expect(createSpy).toHaveBeenCalled();
    });
  });

  describe("EXTENSIONS_SET_ENABLED", () => {
    it("loads extension when enabling and emits EXTENSIONS_CHANGED", async () => {
      const loadExtension = vi.fn(async (p: string) => ({
        id: "test-ext-id",
        name: "Test",
        version: "1.0.0",
        path: p,
      }));
      const { commands, events, dataStore, deps } = setup({ loadExtension });

      // Pre-populate with a disabled extension
      await dataStore.setSetting("extensions", [
        { id: "test-ext-id", name: "Test", version: "1.0.0", enabled: false },
      ]);
      await feature.start?.(deps);

      const listener = vi.fn();
      events.on(EXTENSIONS_CHANGED, listener);

      await commands.send(EXTENSIONS_SET_ENABLED, {
        extensionId: "test-ext-id",
        enabled: true,
      });

      expect(loadExtension).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          extensions: expect.arrayContaining([
            expect.objectContaining({ id: "test-ext-id", enabled: true }),
          ]),
        }),
      );
    });

    it("removes extension when disabling", async () => {
      const removeExtension = vi.fn();
      const loadExtension = vi.fn(async (p: string) => ({
        id: "test-ext-id",
        name: "Test",
        version: "1.0.0",
        path: p,
      }));
      const { commands, events, dataStore, deps } = setup({
        removeExtension,
        loadExtension,
      });

      await dataStore.setSetting("extensions", [
        { id: "test-ext-id", name: "Test", version: "1.0.0", enabled: true },
      ]);
      await feature.start?.(deps);

      await commands.send(EXTENSIONS_SET_ENABLED, {
        extensionId: "test-ext-id",
        enabled: false,
      });

      expect(removeExtension).toHaveBeenCalledWith("test-ext-id");
    });
  });

  describe("EXTENSIONS_UNINSTALL", () => {
    it("removes extension from session and emits EXTENSIONS_CHANGED", async () => {
      const removeExtension = vi.fn();
      const loadExtension = vi.fn(async (p: string) => ({
        id: "test-ext-id",
        name: "Test",
        version: "1.0.0",
        path: p,
      }));
      const { commands, events, dataStore, deps } = setup({
        removeExtension,
        loadExtension,
      });

      await dataStore.setSetting("extensions", [
        { id: "test-ext-id", name: "Test", version: "1.0.0", enabled: true },
      ]);
      await feature.start?.(deps);

      const listener = vi.fn();
      events.on(EXTENSIONS_CHANGED, listener);

      await commands.send(EXTENSIONS_UNINSTALL, { extensionId: "test-ext-id" });

      expect(removeExtension).toHaveBeenCalledWith("test-ext-id");
      const lastCall = listener.mock.calls[
        listener.mock.calls.length - 1
      ][0] as ExtensionsChangedEvent;
      expect(lastCall.extensions).toEqual([]);
    });

    it("persists removal to data store", async () => {
      const loadExtension = vi.fn(async (p: string) => ({
        id: "test-ext-id",
        name: "Test",
        version: "1.0.0",
        path: p,
      }));
      const { commands, dataStore, deps } = setup({ loadExtension });

      await dataStore.setSetting("extensions", [
        { id: "test-ext-id", name: "Test", version: "1.0.0", enabled: true },
      ]);
      await feature.start?.(deps);

      await commands.send(EXTENSIONS_UNINSTALL, { extensionId: "test-ext-id" });

      const stored = await dataStore.getSetting<InstalledExtension[]>("extensions");
      expect(stored).toEqual([]);
    });
  });

  describe("feature.start()", () => {
    it("loads persisted enabled extensions and emits EXTENSIONS_CHANGED", async () => {
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const loadExtension = vi.fn(async (p: string) => ({
        id: p.split("/").pop() ?? "",
        name: "Loaded",
        version: "2.0.0",
        path: p,
      }));
      const { events, dataStore, deps } = setup({ loadExtension });

      await dataStore.setSetting("extensions", [
        { id: "ext-a", name: "Ext A", version: "1.0.0", enabled: true },
        { id: "ext-b", name: "Ext B", version: "1.0.0", enabled: false },
      ]);

      const listener = vi.fn();
      events.on(EXTENSIONS_CHANGED, listener);

      await feature.start?.(deps);

      // Only enabled extension should be loaded
      expect(loadExtension).toHaveBeenCalledTimes(1);
      expect(loadExtension).toHaveBeenCalledWith(expect.stringContaining("ext-a"));

      existsSyncSpy.mockRestore();
    });

    it("emits empty list when no persisted extensions", async () => {
      const { events, deps } = setup();
      const listener = vi.fn();
      events.on(EXTENSIONS_CHANGED, listener);

      await feature.start?.(deps);

      expect(listener).toHaveBeenCalledWith({ extensions: [] });
    });
  });
});
