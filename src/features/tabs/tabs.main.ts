import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Bounds, Platform } from "../../platform/types";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import type {
  TAB_LOADING_CHANGED,
  TabLoadingChangedPayload,
} from "../window-chrome/window-chrome.shared";
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
  TABS_REPORT_CONTENT_BOUNDS,
  TABS_TOGGLE_BOOKMARK,
  TABS_UPDATED,
  type Tab,
  type TabsCommands,
  type TabsEvents,
} from "./tabs.shared";

type AllCommands = TabsCommands;
type AllEvents = TabsEvents & { [K in typeof TAB_LOADING_CHANGED]: TabLoadingChangedPayload };

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  setActiveTabId: (tabId: TabId | undefined) => void;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
}

// Shared state exposed via accessor for cross-feature queries
let _tabs: Map<TabId, Tab> | undefined;

export function register(deps: Deps): void {
  const {
    commands,
    events,
    platform,
    getActiveWindowId,
    getActiveTabId,
    setActiveTabId,
    getActiveWorkspaceId,
  } = deps;

  const tabs = new Map<TabId, Tab>();
  let contentBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  const eventCleanups = new Map<TabId, (() => void)[]>();

  // Expose for getTabsForWorkspace
  _tabs = tabs;

  // ── Debounced list-changed emission ─────────────────────────────
  let listDirty = false;
  let listTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleListChanged(): void {
    if (listDirty) return;
    listDirty = true;
    listTimer = setTimeout(() => {
      listDirty = false;
      listTimer = undefined;
      events.emit(TABS_LIST_CHANGED, { tabs: [...tabs.values()] });
    }, 0);
  }

  function flushListChanged(): void {
    if (!listDirty) return;
    if (listTimer !== undefined) clearTimeout(listTimer);
    listDirty = false;
    listTimer = undefined;
    events.emit(TABS_LIST_CHANGED, { tabs: [...tabs.values()] });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function findMruTab(workspaceId: WorkspaceId, excludeTabId?: TabId): Tab | undefined {
    let best: Tab | undefined;
    for (const tab of tabs.values()) {
      if (tab.workspaceId !== workspaceId) continue;
      if (tab.id === excludeTabId) continue;
      if (!best || tab.lastAccessedAt > best.lastAccessedAt) {
        best = tab;
      }
    }
    return best;
  }

  function attachTabListeners(tabId: TabId): void {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      platform.onTabEvent(tabId, "page-title-updated", (_event: unknown, title: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.title = title as string;
        events.emit(TABS_UPDATED, { tab: { ...tab } });
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-navigate", (_event: unknown, url: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.url = url as string;
        events.emit(TABS_UPDATED, { tab: { ...tab } });
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-navigate-in-page", (_event: unknown, url: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.url = url as string;
        events.emit(TABS_UPDATED, { tab: { ...tab } });
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-start-loading", () => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.loading = true;
        events.emit(TABS_UPDATED, { tab: { ...tab } });
        events.emit("tab:loading-changed", { tabId, loading: true });
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-stop-loading", () => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.loading = false;
        const currentUrl = platform.getTabUrl(tabId);
        if (currentUrl) tab.url = currentUrl;
        const currentTitle = platform.getTabTitle(tabId);
        if (currentTitle) tab.title = currentTitle;
        events.emit(TABS_UPDATED, { tab: { ...tab } });
        events.emit("tab:loading-changed", { tabId, loading: false });
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "page-favicon-updated", (_event: unknown, favicons: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        const urls = favicons as string[];
        if (urls.length > 0 && urls[0]) {
          tab.favicon = urls[0];
          events.emit(TABS_UPDATED, { tab: { ...tab } });
        }
      }),
    );

    eventCleanups.set(tabId, cleanups);
  }

  // ── Command handlers ────────────────────────────────────────────

  commands.handle(TABS_CREATE, async (payload) => {
    const windowId = getActiveWindowId();
    if (!windowId) throw new Error("No active window");

    const workspaceId = payload.workspaceId ?? getActiveWorkspaceId();
    if (!workspaceId) throw new Error("No active workspace");

    const tabId = await platform.createTab(windowId, payload.url);

    const tab: Tab = {
      id: tabId,
      workspaceId,
      url: payload.url,
      title: payload.url,
      favicon: "",
      loading: true,
      bookmarked: false,
      lastAccessedAt: Date.now(),
      order: tabs.size,
    };

    tabs.set(tabId, tab);
    attachTabListeners(tabId);

    events.emit(TABS_CREATED, { tab });
    events.emit("tab:loading-changed", { tabId, loading: true });
    scheduleListChanged();

    // Activate by default
    if (payload.activate !== false) {
      await commands.send(TABS_ACTIVATE, { tabId });
    }

    return tabId;
  });

  commands.handle(TABS_CLOSE, async (payload) => {
    const { tabId } = payload;
    const tab = tabs.get(tabId);
    if (!tab) return;

    // Clean up event listeners
    const cleanups = eventCleanups.get(tabId);
    if (cleanups) {
      for (const fn of cleanups) fn();
      eventCleanups.delete(tabId);
    }

    const wasActive = getActiveTabId() === tabId;
    await platform.closeTab(tabId);
    tabs.delete(tabId);

    let activatedTabId: TabId | null = null;
    if (wasActive) {
      const mru = findMruTab(tab.workspaceId);
      if (mru) {
        activatedTabId = mru.id;
        await commands.send(TABS_ACTIVATE, { tabId: mru.id });
      } else {
        setActiveTabId(undefined);
      }
    }

    events.emit(TABS_CLOSED, { tabId, activatedTabId });
    flushListChanged();
  });

  commands.handle(TABS_ACTIVATE, async (payload) => {
    const { tabId } = payload;
    const tab = tabs.get(tabId);
    if (!tab) return;

    const windowId = getActiveWindowId();
    if (!windowId) return;

    const previousTabId = getActiveTabId() ?? null;

    // Hide previous tab
    if (previousTabId && previousTabId !== tabId) {
      platform.hideTab(previousTabId);
    }

    // Show new tab
    setActiveTabId(tabId);
    tab.lastAccessedAt = Date.now();
    platform.setTabBounds(tabId, contentBounds);

    events.emit(TABS_ACTIVATED, { tabId, previousTabId });
    events.emit(TABS_UPDATED, { tab: { ...tab } });
  });

  commands.handle(TABS_NAVIGATE, async (payload) => {
    const tabId = payload.tabId ?? getActiveTabId();
    if (!tabId) return;
    const tab = tabs.get(tabId);
    if (!tab) return;

    tab.url = payload.url;
    tab.loading = true;
    await platform.navigateTab(tabId, payload.url);

    events.emit(TABS_UPDATED, { tab: { ...tab } });
    events.emit("tab:loading-changed", { tabId, loading: true });
  });

  commands.handle(TABS_TOGGLE_BOOKMARK, async (payload) => {
    const tabId = payload.tabId ?? getActiveTabId();
    if (!tabId) return;
    const tab = tabs.get(tabId);
    if (!tab) return;

    // TODO: when PinnedTabs feature is implemented, skip if tab.pinned
    // if ('pinned' in tab && tab.pinned) return;

    tab.bookmarked = !tab.bookmarked;
    events.emit(TABS_UPDATED, { tab: { ...tab } });
    scheduleListChanged();
  });

  commands.handle(TABS_CLEAR_EPHEMERAL, async (payload) => {
    const workspaceId = payload.workspaceId ?? getActiveWorkspaceId();
    if (!workspaceId) return;
    const toClose: TabId[] = [];
    for (const tab of tabs.values()) {
      if (tab.workspaceId === workspaceId && !tab.bookmarked) {
        toClose.push(tab.id);
      }
    }
    for (const tabId of toClose) {
      await commands.send(TABS_CLOSE, { tabId });
    }
  });

  commands.handle(TABS_REPORT_CONTENT_BOUNDS, async (payload) => {
    contentBounds = payload;
    const activeTabId = getActiveTabId();
    if (activeTabId) {
      platform.setTabBounds(activeTabId, contentBounds);
    }
  });

  platform.registerShortcut("CommandOrControl+B", () => {
    commands.send(TABS_TOGGLE_BOOKMARK, {}).catch(console.error);
  });
}

export function start(_deps: Deps): void {
  // No initial state to emit — user opens first tab via Ctrl-T
}

export function getTabsForWorkspace(workspaceId: WorkspaceId): Tab[] {
  if (!_tabs) return [];
  return [..._tabs.values()].filter((t) => t.workspaceId === workspaceId);
}
