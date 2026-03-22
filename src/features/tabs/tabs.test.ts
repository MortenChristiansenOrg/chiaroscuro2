import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";

// Must mock pinned-tabs and folders before importing tabs.main
vi.mock("../pinned-tabs/pinned-tabs.main", () => ({
  isPinned: vi.fn(() => false),
}));
vi.mock("../folders/folders.main", () => ({
  getFoldersForLevel: vi.fn(() => []),
  setFolderOrder: vi.fn(),
}));

import { isPinned } from "../pinned-tabs/pinned-tabs.main";
import type { TabLoadingChangedPayload } from "../window-chrome/window-chrome.shared";
import feature from "./tabs.main";
import { start } from "./tabs.main";
import {
  TABS_ACTIVATE,
  TABS_ACTIVATED,
  TABS_CLEAR_EPHEMERAL,
  TABS_CLOSE,
  TABS_CLOSED,
  TABS_CREATE,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  TABS_NAVIGATE,
  TABS_REORDER,
  TABS_REPORT_CONTENT_BOUNDS,
  TABS_TOGGLE_BOOKMARK,
  TABS_UPDATED,
  type Tab,
  type TabsCommands,
  type TabsEvents,
} from "./tabs.shared";

const WIN_ID = "win-1" as WindowId;
const WS_ID = "ws-1" as WorkspaceId;

type AllCommands = TabsCommands;
type AllEvents = TabsEvents & { "tab:loading-changed": TabLoadingChangedPayload };

let tabCounter = 0;

function setup(platformOverrides = {}) {
  tabCounter = 0;
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform({
    createTab: vi.fn(async () => `tab-${++tabCounter}` as TabId),
    ...platformOverrides,
  });
  const dataStore = new MemoryDataStore();
  let activeTabId: TabId | undefined;
  const deps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId: () => WIN_ID as WindowId | undefined,
    getActiveTabId: () => activeTabId,
    setActiveTabId: (id: TabId | undefined) => {
      activeTabId = id;
    },
    getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
    isPinned: (id: TabId) => isPinned(id),
    getCustomization: () => undefined as { fixedAddressDisabled: boolean } | undefined,
    getFoldersForLevel: () => [] as { id: import("../../shared/types").FolderId; order: number }[],
    setFolderOrder: () => {},
  };
  feature.register(deps);
  return { commands, events, platform, dataStore, deps, getActiveTabId: () => activeTabId };
}

describe("tabs commands", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (isPinned as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("TABS_CREATE", () => {
    it("creates tab via platform, emits CREATED + LIST_CHANGED", async () => {
      const { commands, events } = setup();
      const created = vi.fn();
      const listChanged = vi.fn();
      events.on(TABS_CREATED, created);
      events.on(TABS_LIST_CHANGED, listChanged);

      const tabId = await commands.send(TABS_CREATE, { url: "https://example.com" });

      expect(tabId).toBe("tab-1");
      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({
          tab: expect.objectContaining({ url: "https://example.com" }),
        }),
      );

      // LIST_CHANGED is debounced via setTimeout(0)
      vi.advanceTimersByTime(1);
      expect(listChanged).toHaveBeenCalled();
    });

    it("auto-activates new tab by default", async () => {
      const { commands, events } = setup();
      const activated = vi.fn();
      events.on(TABS_ACTIVATED, activated);

      await commands.send(TABS_CREATE, { url: "https://example.com" });

      expect(activated).toHaveBeenCalledWith(expect.objectContaining({ tabId: "tab-1" }));
    });

    it("respects activate:false", async () => {
      const { commands, events } = setup();
      const activated = vi.fn();
      events.on(TABS_ACTIVATED, activated);

      await commands.send(TABS_CREATE, { url: "https://example.com", activate: false });

      expect(activated).not.toHaveBeenCalled();
    });
  });

  describe("TABS_CLOSE", () => {
    it("closes tab via platform, emits CLOSED", async () => {
      const { commands, events, platform } = setup();
      await commands.send(TABS_CREATE, { url: "https://example.com" });

      const closed = vi.fn();
      events.on(TABS_CLOSED, closed);
      await commands.send(TABS_CLOSE, { tabId: "tab-1" as TabId });

      expect(platform.closeTab).toHaveBeenCalledWith("tab-1");
      expect(closed).toHaveBeenCalledWith(expect.objectContaining({ tabId: "tab-1" }));
    });

    it("activates MRU tab when closing active tab", async () => {
      const { commands, events } = setup();
      await commands.send(TABS_CREATE, { url: "https://first.com" });
      await commands.send(TABS_CREATE, { url: "https://second.com" });
      // tab-2 is active (last created)

      const closed = vi.fn();
      events.on(TABS_CLOSED, closed);
      await commands.send(TABS_CLOSE, { tabId: "tab-2" as TabId });

      expect(closed).toHaveBeenCalledWith(expect.objectContaining({ activatedTabId: "tab-1" }));
    });

    it("flushes pending list-changed synchronously", async () => {
      const { commands, events } = setup();
      await commands.send(TABS_CREATE, { url: "https://first.com" });
      // Don't advance timers — listDirty is still true from create

      await commands.send(TABS_CREATE, { url: "https://second.com", activate: false });
      // Two schedules pending, listDirty = true

      const listChanged = vi.fn();
      events.on(TABS_LIST_CHANGED, listChanged);
      await commands.send(TABS_CLOSE, { tabId: "tab-2" as TabId });

      // flushListChanged fires synchronously during CLOSE
      expect(listChanged).toHaveBeenCalled();
    });
  });

  describe("TABS_ACTIVATE", () => {
    it("hides previous tab, sets bounds, emits ACTIVATED + UPDATED", async () => {
      const { commands, events, platform } = setup();
      // Report content bounds first
      await commands.send(TABS_REPORT_CONTENT_BOUNDS, { x: 0, y: 40, width: 800, height: 560 });

      await commands.send(TABS_CREATE, { url: "https://first.com" });
      await commands.send(TABS_CREATE, { url: "https://second.com", activate: false });

      const activated = vi.fn();
      events.on(TABS_ACTIVATED, activated);

      await commands.send(TABS_ACTIVATE, { tabId: "tab-2" as TabId });

      expect(platform.hideTab).toHaveBeenCalledWith("tab-1");
      expect(platform.setTabBounds).toHaveBeenCalledWith("tab-2", {
        x: 0,
        y: 40,
        width: 800,
        height: 560,
      });
      expect(activated).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: "tab-2",
          previousTabId: "tab-1",
        }),
      );
    });
  });

  describe("TABS_NAVIGATE", () => {
    it("navigates tab via platform, emits UPDATED", async () => {
      const { commands, events, platform } = setup();
      await commands.send(TABS_CREATE, { url: "https://example.com" });

      const updated = vi.fn();
      events.on(TABS_UPDATED, updated);
      await commands.send(TABS_NAVIGATE, { url: "https://new.com" });

      expect(platform.navigateTab).toHaveBeenCalledWith("tab-1", "https://new.com");
      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({
          tab: expect.objectContaining({ url: "https://new.com" }),
        }),
      );
    });
  });

  describe("TABS_TOGGLE_BOOKMARK", () => {
    it("toggles bookmarked flag, emits UPDATED", async () => {
      const { commands, events } = setup();
      await commands.send(TABS_CREATE, { url: "https://example.com" });

      const updated = vi.fn();
      events.on(TABS_UPDATED, updated);
      await commands.send(TABS_TOGGLE_BOOKMARK, {});

      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({
          tab: expect.objectContaining({ bookmarked: true }),
        }),
      );
    });

    it("skips pinned tabs", async () => {
      const { commands, events } = setup();
      await commands.send(TABS_CREATE, { url: "https://example.com" });
      (isPinned as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const updated = vi.fn();
      events.on(TABS_UPDATED, updated);
      await commands.send(TABS_TOGGLE_BOOKMARK, {});

      expect(updated).not.toHaveBeenCalled();
    });
  });

  describe("TABS_CLEAR_EPHEMERAL", () => {
    it("closes all unbookmarked tabs in workspace", async () => {
      const { commands, platform } = setup();
      await commands.send(TABS_CREATE, { url: "https://bookmarked.com" });
      // Bookmark tab-1
      await commands.send(TABS_TOGGLE_BOOKMARK, { tabId: "tab-1" as TabId });
      await commands.send(TABS_CREATE, { url: "https://ephemeral.com" });
      // tab-2 is unbookmarked (default)

      await commands.send(TABS_CLEAR_EPHEMERAL, {});

      // Only tab-2 should be closed
      expect(platform.closeTab).toHaveBeenCalledWith("tab-2");
      expect(platform.closeTab).not.toHaveBeenCalledWith("tab-1");
    });
  });

  describe("TABS_REORDER", () => {
    it("auto-bookmarks when moving to bookmarked section", async () => {
      const { commands, events } = setup();
      await commands.send(TABS_CREATE, { url: "https://example.com" });
      // tab-1 starts unbookmarked

      const updated = vi.fn();
      events.on(TABS_UPDATED, updated);
      await commands.send(TABS_REORDER, {
        tabId: "tab-1" as TabId,
        targetBookmarked: true,
      });

      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({
          tab: expect.objectContaining({ bookmarked: true }),
        }),
      );
    });

    it("re-indexes sibling order values", async () => {
      const { commands, events } = setup();
      await commands.send(TABS_CREATE, { url: "https://a.com" });
      await commands.send(TABS_TOGGLE_BOOKMARK, { tabId: "tab-1" as TabId });
      await commands.send(TABS_CREATE, { url: "https://b.com" });
      await commands.send(TABS_TOGGLE_BOOKMARK, { tabId: "tab-2" as TabId });
      await commands.send(TABS_CREATE, { url: "https://c.com" });
      await commands.send(TABS_TOGGLE_BOOKMARK, { tabId: "tab-3" as TabId });

      vi.advanceTimersByTime(1);

      // Move tab-3 before tab-1
      const updatedTabs: Tab[] = [];
      events.on(TABS_UPDATED, ({ tab }) => updatedTabs.push(tab));

      await commands.send(TABS_REORDER, {
        tabId: "tab-3" as TabId,
        targetBookmarked: true,
        targetTabId: "tab-1" as TabId,
        position: "before",
      });

      // tab-3 should now be order 0
      const reordered = updatedTabs.find((t) => t.id === ("tab-3" as TabId));
      expect(reordered?.order).toBe(0);
    });
  });

  describe("TABS_REPORT_CONTENT_BOUNDS", () => {
    it("updates bounds and applies to active tab", async () => {
      const { commands, platform } = setup();
      await commands.send(TABS_CREATE, { url: "https://example.com" });

      await commands.send(TABS_REPORT_CONTENT_BOUNDS, { x: 10, y: 20, width: 100, height: 200 });

      expect(platform.setTabBounds).toHaveBeenCalledWith("tab-1", {
        x: 10,
        y: 20,
        width: 100,
        height: 200,
      });
    });
  });
});

describe("start()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (isPinned as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores persisted tabs, filters expired ephemeral", async () => {
    const dataStore = new MemoryDataStore();
    const tabsColl = dataStore.collection("tabs");
    const now = Date.now();

    // Bookmarked tab — should survive
    await tabsColl.insert({
      id: "old-1",
      workspaceId: WS_ID,
      url: "https://bookmarked.com",
      title: "Bookmarked",
      favicon: "",
      bookmarked: true,
      lastAccessedAt: now - 24 * 60 * 60 * 1000, // 24h ago
      createdAt: now - 48 * 60 * 60 * 1000,
      order: 0,
    });

    // Expired ephemeral — should be removed
    await tabsColl.insert({
      id: "old-2",
      workspaceId: WS_ID,
      url: "https://expired.com",
      title: "Expired",
      favicon: "",
      bookmarked: false,
      lastAccessedAt: now - 9 * 60 * 60 * 1000, // 9h ago (> 8h TTL)
      createdAt: now - 10 * 60 * 60 * 1000,
      order: 1,
    });

    let newTabCounter = 0;
    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform({
      createTab: vi.fn(
        async (_wId: WindowId, _url: string, tabId?: TabId) =>
          tabId ?? (`new-${++newTabCounter}` as TabId),
      ),
    });
    let activeTabId: TabId | undefined;
    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => activeTabId,
      setActiveTabId: (id: TabId | undefined) => {
        activeTabId = id;
      },
      getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
      isPinned: (id: TabId) => isPinned(id),
      getCustomization: () => undefined as { fixedAddressDisabled: boolean } | undefined,
      getFoldersForLevel: () =>
        [] as { id: import("../../shared/types").FolderId; order: number }[],
      setFolderOrder: () => {},
    };
    feature.register(deps);
    await start(deps);

    // Only 1 tab restored (bookmarked one), keeps its persisted ID, created lazily
    expect(platform.createTab).toHaveBeenCalledTimes(1);
    expect(platform.createTab).toHaveBeenCalledWith(WIN_ID, "https://bookmarked.com", "old-1", {
      lazy: true,
    });
  });

  it("loads tab URL on first activation (lazy loading)", async () => {
    const dataStore = new MemoryDataStore();
    const tabsColl = dataStore.collection("tabs");
    const now = Date.now();

    await tabsColl.insert({
      id: "lazy-1",
      workspaceId: WS_ID,
      url: "https://lazy.com",
      title: "Lazy",
      favicon: "",
      bookmarked: true,
      lastAccessedAt: now,
      createdAt: now,
      order: 0,
    });
    await tabsColl.insert({
      id: "lazy-2",
      workspaceId: WS_ID,
      url: "https://lazy2.com",
      title: "Lazy2",
      favicon: "",
      bookmarked: true,
      lastAccessedAt: now - 1000,
      createdAt: now - 1000,
      order: 1,
    });

    let newTabCounter = 0;
    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform({
      createTab: vi.fn(
        async (_wId: WindowId, _url: string, tabId?: TabId) =>
          tabId ?? (`new-${++newTabCounter}` as TabId),
      ),
    });
    let activeTabId: TabId | undefined;
    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => activeTabId,
      setActiveTabId: (id: TabId | undefined) => {
        activeTabId = id;
      },
      getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
      isPinned: (id: TabId) => isPinned(id),
      getCustomization: () => undefined as { fixedAddressDisabled: boolean } | undefined,
      getFoldersForLevel: () =>
        [] as { id: import("../../shared/types").FolderId; order: number }[],
      setFolderOrder: () => {},
    };
    feature.register(deps);
    await start(deps);

    // First tab (lazy-1, MRU) was activated and navigated
    expect(platform.navigateTab).toHaveBeenCalledWith("lazy-1", "https://lazy.com");
    // Second tab was NOT navigated (still lazy)
    expect(platform.navigateTab).not.toHaveBeenCalledWith("lazy-2", "https://lazy2.com");

    // Now activate the second tab — should trigger navigation
    await commands.send(TABS_ACTIVATE, { tabId: "lazy-2" as TabId });
    expect(platform.navigateTab).toHaveBeenCalledWith("lazy-2", "https://lazy2.com");

    // Re-activating should NOT navigate again
    (platform.navigateTab as ReturnType<typeof vi.fn>).mockClear();
    await commands.send(TABS_ACTIVATE, { tabId: "lazy-1" as TabId });
    expect(platform.navigateTab).not.toHaveBeenCalled();
  });

  it("does nothing when no persisted tabs", async () => {
    const dataStore = new MemoryDataStore();
    const commands = new CommandBus<AllCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform();
    let activeTabId: TabId | undefined;
    const deps = {
      commands,
      events,
      platform,
      dataStore,
      getActiveWindowId: () => WIN_ID as WindowId | undefined,
      getActiveTabId: () => activeTabId,
      setActiveTabId: (id: TabId | undefined) => {
        activeTabId = id;
      },
      getActiveWorkspaceId: () => WS_ID as WorkspaceId | undefined,
      isPinned: (id: TabId) => isPinned(id),
      getCustomization: () => undefined as { fixedAddressDisabled: boolean } | undefined,
      getFoldersForLevel: () =>
        [] as { id: import("../../shared/types").FolderId; order: number }[],
      setFolderOrder: () => {},
    };
    feature.register(deps);
    await start(deps);

    expect(platform.createTab).not.toHaveBeenCalled();
  });
});
