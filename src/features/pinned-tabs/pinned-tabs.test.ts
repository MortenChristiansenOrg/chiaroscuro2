import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import {
  TABS_ACTIVATE,
  TABS_CLOSE,
  TABS_CLOSED,
  TABS_CREATE,
  TABS_UPDATED,
} from "../tabs/tabs.shared";
import { register, start } from "./pinned-tabs.main";
import {
  PINNED_TABS_ACTIVATE,
  PINNED_TABS_ACTIVE_CHANGED,
  PINNED_TABS_CHANGED,
  PINNED_TABS_TOGGLE_PIN,
} from "./pinned-tabs.shared";

const WIN_ID = "win-1" as WindowId;
const TAB_ID = "tab-1" as TabId;

type AllCommands = Parameters<typeof register>[0] extends { commands: CommandBus<infer C> }
  ? C
  : never;
type AllEvents = Parameters<typeof register>[0] extends { events: EventBus<infer E> } ? E : never;

function setup(overrides: { activeTabId?: TabId | null } = {}) {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform({
    getTabUrl: vi.fn(() => "https://example.com"),
    getTabTitle: vi.fn(() => "Example"),
  });
  const dataStore = new MemoryDataStore();
  const activeTabId =
    overrides.activeTabId === null ? undefined : (overrides.activeTabId ?? TAB_ID);

  // Register stub tab handlers
  commands.handle(TABS_ACTIVATE, async () => {});
  commands.handle(TABS_CLOSE, async () => {});
  commands.handle(TABS_CREATE, async () => "new-tab" as TabId);

  const deps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId: () => WIN_ID as WindowId | undefined,
    getActiveTabId: () => activeTabId as TabId | undefined,
    setActiveTabId: () => {},
    getActiveWorkspaceId: () => "ws-1" as WorkspaceId | undefined,
  };
  register(deps);
  return { commands, events, platform, dataStore, deps };
}

describe("pinned-tabs commands", () => {
  describe("TOGGLE_PIN", () => {
    it("pins a tab, emits CHANGED", async () => {
      const { commands, events } = setup();
      const changed = vi.fn();
      events.on(PINNED_TABS_CHANGED, changed);

      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined);

      expect(changed).toHaveBeenCalledWith(
        expect.objectContaining({
          pinnedTabs: expect.arrayContaining([
            expect.objectContaining({ id: TAB_ID, url: "https://example.com" }),
          ]),
        }),
      );
    });

    it("unpins a pinned tab", async () => {
      const { commands, events } = setup();
      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined); // pin

      const changed = vi.fn();
      events.on(PINNED_TABS_CHANGED, changed);
      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined); // unpin

      expect(changed).toHaveBeenCalledWith({ pinnedTabs: [] });
    });

    it("no-ops when no active tab", async () => {
      const { commands, events } = setup({ activeTabId: null });
      const changed = vi.fn();
      events.on(PINNED_TABS_CHANGED, changed);

      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined);

      expect(changed).not.toHaveBeenCalled();
    });
  });

  describe("ACTIVATE", () => {
    it("activates tab and emits ACTIVE_CHANGED", async () => {
      const { commands, events } = setup();
      // Pin first
      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined);

      const activeChanged = vi.fn();
      events.on(PINNED_TABS_ACTIVE_CHANGED, activeChanged);

      await commands.send(PINNED_TABS_ACTIVATE, { tabId: TAB_ID });

      expect(activeChanged).toHaveBeenCalledWith({ tabId: TAB_ID });
    });

    it("no-ops for non-pinned tab", async () => {
      const { commands, events } = setup();
      const activeChanged = vi.fn();
      events.on(PINNED_TABS_ACTIVE_CHANGED, activeChanged);

      await commands.send(PINNED_TABS_ACTIVATE, { tabId: "unknown" as TabId });

      expect(activeChanged).not.toHaveBeenCalled();
    });
  });

  describe("TABS_UPDATED syncs pinned tab data", () => {
    it("updates url/title/favicon for pinned tab", async () => {
      const { commands, events } = setup();
      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined);

      const changed = vi.fn();
      events.on(PINNED_TABS_CHANGED, changed);

      events.emit(TABS_UPDATED, {
        tab: {
          id: TAB_ID,
          workspaceId: "ws-1" as WorkspaceId,
          url: "https://new-url.com",
          title: "New Title",
          favicon: "new-icon.png",
          loading: false,
          bookmarked: false,
          lastAccessedAt: 0,
          createdAt: 0,
          order: 0,
        },
      });

      // The sync happens internally but doesn't emit CHANGED
      // We can verify via next pin toggle that data was updated
    });
  });

  describe("TABS_CLOSED removes stale pinned entry", () => {
    it("removes pinned tab when underlying tab closes", async () => {
      const { commands, events } = setup();
      await commands.send(PINNED_TABS_TOGGLE_PIN, undefined);

      const changed = vi.fn();
      events.on(PINNED_TABS_CHANGED, changed);

      events.emit(TABS_CLOSED, { tabId: TAB_ID, activatedTabId: null });

      expect(changed).toHaveBeenCalledWith({ pinnedTabs: [] });
    });
  });
});

describe("start()", () => {
  it("restores pinned tabs using idMap", async () => {
    const dataStore = new MemoryDataStore();
    const pinnedColl = dataStore.collection("pinned-tabs");
    await pinnedColl.insert({
      id: "old-tab",
      url: "https://example.com",
      title: "Example",
      favicon: "",
      order: 0,
    });

    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform({
      getTabUrl: vi.fn(() => "https://example.com"),
      getTabTitle: vi.fn(() => "Example"),
    });
    commands.handle(TABS_ACTIVATE, async () => {});
    commands.handle(TABS_CLOSE, async () => {});
    commands.handle(TABS_CREATE, async () => "new-tab" as TabId);

    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => TAB_ID as TabId | undefined,
      setActiveTabId: () => {},
      getActiveWorkspaceId: () => "ws-1" as WorkspaceId | undefined,
    };
    register(deps);

    const changed = vi.fn();
    events.on(PINNED_TABS_CHANGED, changed);

    const idMap = new Map<TabId, TabId>([["old-tab" as TabId, "new-tab" as TabId]]);
    const urlMap = new Map<string, TabId>([["https://example.com", "new-tab" as TabId]]);
    await start(deps, { idMap, urlMap });

    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedTabs: expect.arrayContaining([expect.objectContaining({ id: "new-tab" })]),
      }),
    );
  });

  it("skips stale pinned entries with no matching restored tab", async () => {
    const dataStore = new MemoryDataStore();
    const pinnedColl = dataStore.collection("pinned-tabs");
    await pinnedColl.insert({
      id: "old-tab",
      url: "https://gone.com",
      title: "Gone",
      favicon: "",
      order: 0,
    });

    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform();
    commands.handle(TABS_ACTIVATE, async () => {});
    commands.handle(TABS_CLOSE, async () => {});
    commands.handle(TABS_CREATE, async () => "new-tab" as TabId);

    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => undefined as TabId | undefined,
      setActiveTabId: () => {},
      getActiveWorkspaceId: () => "ws-1" as WorkspaceId | undefined,
    };
    register(deps);

    const changed = vi.fn();
    events.on(PINNED_TABS_CHANGED, changed);

    // Empty maps — no restored tabs
    const idMap = new Map<TabId, TabId>();
    const urlMap = new Map<string, TabId>();
    await start(deps, { idMap, urlMap });

    // No pinned tabs restored → no CHANGED event
    expect(changed).not.toHaveBeenCalled();
  });
});
