import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WorkspaceId } from "../../shared/types";
import { DEFAULT_PROVIDERS } from "../command-palette/resolve-input";
import type { TabsClosedEvent, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import { register, start } from "./settings.main";
import {
  SETTINGS_CHANGED,
  SETTINGS_GET,
  SETTINGS_OPEN,
  SETTINGS_SAVE,
  type Settings,
  type SettingsChangedEvent,
  type SettingsCommands,
  type SettingsEvents,
} from "./settings.shared";

type AllCommands = SettingsCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = SettingsEvents & Pick<TabsEvents, "tabs:closed">;

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  let activeTabId: TabId | undefined;

  const deps = {
    commands,
    events,
    dataStore,
    getActiveTabId: () => activeTabId,
  };

  // Mock tabs:create and tabs:activate since settings depends on them
  commands.handle("tabs:create", async (payload) => {
    return `mock-tab-${payload.url}` as TabId;
  });
  commands.handle("tabs:activate", async () => {});

  register(deps);
  return { commands, events, dataStore, deps };
}

describe("settings commands", () => {
  describe("SETTINGS_GET", () => {
    it("returns default settings before any save", async () => {
      const { commands } = setup();
      const settings = await commands.send(SETTINGS_GET, undefined);
      expect(settings.searchProviders).toEqual(DEFAULT_PROVIDERS);
      expect(settings.defaultSearchProviderId).toBe("!g");
    });
  });

  describe("SETTINGS_SAVE", () => {
    it("persists settings and emits SETTINGS_CHANGED", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(SETTINGS_CHANGED, listener);

      const newSettings: Settings = {
        searchProviders: [
          { bang: "!test", name: "Test", urlTemplate: "https://test.com?q={query}" },
        ],
        defaultSearchProviderId: "!test",
      };

      await commands.send(SETTINGS_SAVE, newSettings);

      expect(listener).toHaveBeenCalledWith({
        settings: expect.objectContaining({
          searchProviders: newSettings.searchProviders,
          defaultSearchProviderId: "!test",
        }),
      });

      // Verify get returns updated
      const saved = await commands.send(SETTINGS_GET, undefined);
      expect(saved.searchProviders).toEqual(newSettings.searchProviders);
      expect(saved.defaultSearchProviderId).toBe("!test");
    });

    it("persists to data store", async () => {
      const { commands, dataStore } = setup();
      const providers = [{ bang: "!x", name: "X", urlTemplate: "https://x.com?q={query}" }];

      await commands.send(SETTINGS_SAVE, {
        searchProviders: providers,
        defaultSearchProviderId: "!x",
      });

      const storedProviders = await dataStore.getSetting("search-providers");
      expect(storedProviders).toEqual(providers);
      const storedDefault = await dataStore.getSetting("default-search-provider");
      expect(storedDefault).toBe("!x");
    });
  });

  describe("SETTINGS_OPEN", () => {
    it("creates a built-in tab via tabs:create", async () => {
      const { commands } = setup();
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "builtin-1" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(SETTINGS_OPEN, undefined);

      expect(createSpy).toHaveBeenCalledWith({ url: "app:settings" });
    });

    it("reactivates existing settings tab (singleton)", async () => {
      const { commands } = setup();
      // First open creates
      await commands.send(SETTINGS_OPEN, undefined);

      // Second open should activate, not create
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "builtin-2" as TabId);
      commands.handle("tabs:create", createSpy);
      commands.unhandle("tabs:activate");
      const activateSpy = vi.fn(async () => {});
      commands.handle("tabs:activate", activateSpy);

      await commands.send(SETTINGS_OPEN, undefined);
      expect(activateSpy).toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("creates new tab if singleton tab was closed", async () => {
      const { commands, events } = setup();
      await commands.send(SETTINGS_OPEN, undefined);

      // Simulate tab close
      events.emit("tabs:closed", {
        tabId: "mock-tab-app:settings" as TabId,
        activatedTabId: null,
      } as TabsClosedEvent);

      // Next open should create
      commands.unhandle("tabs:create");
      const createSpy = vi.fn(async () => "builtin-2" as TabId);
      commands.handle("tabs:create", createSpy);

      await commands.send(SETTINGS_OPEN, undefined);
      expect(createSpy).toHaveBeenCalled();
    });
  });

  describe("start()", () => {
    it("loads persisted settings and emits SETTINGS_CHANGED", async () => {
      const { events, deps, dataStore } = setup();
      const providers = [
        { bang: "!saved", name: "Saved", urlTemplate: "https://saved.com?q={query}" },
      ];
      await dataStore.setSetting("search-providers", providers);
      await dataStore.setSetting("default-search-provider", "!saved");

      const listener = vi.fn();
      events.on(SETTINGS_CHANGED, listener);

      await start(deps);

      expect(listener).toHaveBeenCalledWith({
        settings: expect.objectContaining({
          searchProviders: providers,
          defaultSearchProviderId: "!saved",
        }),
      });
    });

    it("uses defaults when no persisted settings", async () => {
      const { events, deps } = setup();
      const listener = vi.fn();
      events.on(SETTINGS_CHANGED, listener);

      await start(deps);

      const emitted = listener.mock.calls[0][0] as SettingsChangedEvent;
      expect(emitted.settings.searchProviders).toEqual(DEFAULT_PROVIDERS);
      expect(emitted.settings.defaultSearchProviderId).toBe("!g");
    });
  });
});
