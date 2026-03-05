import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Bounds, Platform } from "../../platform/types";
import type { FolderId, TabId, WindowId, WorkspaceId } from "../../shared/types";
import { getFoldersForLevel, setFolderOrder } from "../folders/folders.main";
import { isPinned } from "../pinned-tabs/pinned-tabs.main";
import { getCustomization } from "../tab-customization/tab-customization.main";
import type {
  TAB_LOADING_CHANGED,
  TabLoadingChangedPayload,
} from "../window-chrome/window-chrome.shared";
import {
  type PersistedTab,
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

type AllCommands = TabsCommands;
type AllEvents = TabsEvents & { [K in typeof TAB_LOADING_CHANGED]: TabLoadingChangedPayload };

const EPHEMERAL_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  setActiveTabId: (tabId: TabId | undefined) => void;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
}

function resolveBuiltInTitle(url: string): string {
  const titles: Record<string, string> = {
    "app:settings": "Settings",
    "app:tab-customization": "Tab Customization",
  };
  if (titles[url]) return titles[url];
  // Handle parameterized URLs like app:domain-css?domain=github.com
  const qIndex = url.indexOf("?");
  if (qIndex !== -1) {
    const base = url.slice(0, qIndex);
    if (base === "app:domain-css") {
      const params = new URLSearchParams(url.slice(qIndex + 1));
      const domain = params.get("domain");
      return domain ? `Customization: ${domain}` : "Customization";
    }
    if (base === "app:tab-customization") {
      return "Tab Customization";
    }
  }
  return url;
}

// Shared state exposed via accessor for cross-feature queries
let _tabs: Map<TabId, Tab> | undefined;
let _attachTabListeners: ((tabId: TabId) => void) | undefined;
let _persistTab: ((tab: Tab) => void) | undefined;

// Tracks the "fixed" URL for bookmarked tabs (URL at time of bookmarking).
// Used to restore bookmarked tabs to their original address unless
// fixedAddressDisabled is set.
const fixedUrls = new Map<TabId, string>();

/** Spread a tab with its fixedUrl for event emission. */
function tabSnapshot(tab: Tab): Tab {
  const fixedUrl = fixedUrls.get(tab.id);
  return { ...tab, ...(fixedUrl ? { fixedUrl } : {}) };
}

export function register(deps: Deps): void {
  fixedUrls.clear();
  const {
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId,
    getActiveTabId,
    setActiveTabId,
    getActiveWorkspaceId,
  } = deps;

  const tabs = new Map<TabId, Tab>();
  let contentBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  const eventCleanups = new Map<TabId, (() => void)[]>();
  const tabsCollection: Collection<PersistedTab> = dataStore.collection("tabs");
  let builtInCounter = 0;

  // Expose for getTabsForWorkspace, start(), and cross-feature accessors
  _tabs = tabs;
  _attachTabListeners = attachTabListeners;
  _persistTab = persistTab;

  // ── Persistence helpers ──────────────────────────────────────────

  function persistTab(tab: Tab): void {
    if (tab.builtIn) return;
    const { loading, builtIn, fixedUrl: _fixedUrl, ...persisted } = tab;
    // Bookmarked tabs with fixed address: persist the original URL
    const fixedUrl = fixedUrls.get(tab.id);
    if (tab.bookmarked && fixedUrl && !getCustomization(tab.id)?.fixedAddressDisabled) {
      (persisted as PersistedTab).url = fixedUrl;
    }
    tabsCollection.upsert(persisted as PersistedTab).catch(console.error);
  }

  function removePersistedTab(tabId: TabId): void {
    tabsCollection.remove(tabId).catch(() => {});
  }

  // ── Debounced list-changed emission ─────────────────────────────
  let listDirty = false;
  let listTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleListChanged(): void {
    if (listDirty) return;
    listDirty = true;
    listTimer = setTimeout(() => {
      listDirty = false;
      listTimer = undefined;
      events.emit(TABS_LIST_CHANGED, { tabs: [...tabs.values()].map(tabSnapshot) });
    }, 0);
  }

  function flushListChanged(): void {
    if (!listDirty) return;
    if (listTimer !== undefined) clearTimeout(listTimer);
    listDirty = false;
    listTimer = undefined;
    events.emit(TABS_LIST_CHANGED, { tabs: [...tabs.values()].map(tabSnapshot) });
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
        events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
        persistTab(tab);
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-navigate", (_event: unknown, url: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.url = url as string;
        events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
        persistTab(tab);
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-navigate-in-page", (_event: unknown, url: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.url = url as string;
        events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
        persistTab(tab);
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "did-start-loading", () => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        tab.loading = true;
        events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
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
        events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
        events.emit("tab:loading-changed", { tabId, loading: false });
        persistTab(tab);
      }),
    );

    cleanups.push(
      platform.onTabEvent(tabId, "page-favicon-updated", (_event: unknown, favicons: unknown) => {
        const tab = tabs.get(tabId);
        if (!tab) return;
        const urls = favicons as string[];
        if (urls.length > 0 && urls[0]) {
          tab.favicon = urls[0];
          events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
          persistTab(tab);
        }
      }),
    );

    eventCleanups.set(tabId, cleanups);
  }

  // ── Command handlers ───────────────────────────────────────────

  commands.handle(TABS_CREATE, async (payload) => {
    const windowId = getActiveWindowId();
    if (!windowId) throw new Error("No active window");

    const workspaceId = payload.workspaceId ?? getActiveWorkspaceId();
    if (!workspaceId) throw new Error("No active workspace");

    const isBuiltIn = payload.url.startsWith("app:");
    const tabId = isBuiltIn
      ? (`builtin-${++builtInCounter}` as TabId)
      : await platform.createTab(windowId, payload.url);
    const now = Date.now();

    const tab: Tab = {
      id: tabId,
      workspaceId,
      url: payload.url,
      title: isBuiltIn ? resolveBuiltInTitle(payload.url) : payload.url,
      favicon: "",
      loading: !isBuiltIn,
      bookmarked: false,
      ...(isBuiltIn && { builtIn: true }),
      lastAccessedAt: now,
      createdAt: now,
      order: tabs.size,
      folderId: null,
    };

    tabs.set(tabId, tab);
    if (!isBuiltIn) {
      attachTabListeners(tabId);
      persistTab(tab);
      events.emit("tab:loading-changed", { tabId, loading: true });
    }

    events.emit(TABS_CREATED, { tab });
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
    if (!tab.builtIn) {
      await platform.closeTab(tabId);
      removePersistedTab(tabId);
    }
    tabs.delete(tabId);
    fixedUrls.delete(tabId);

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

    // Hide previous tab (skip if previous was built-in — no WCV to hide)
    if (previousTabId && previousTabId !== tabId) {
      const prevTab = tabs.get(previousTabId);
      if (!prevTab?.builtIn) {
        platform.hideTab(previousTabId);
      }
    }

    // Show new tab (skip platform calls for built-in tabs)
    setActiveTabId(tabId);
    tab.lastAccessedAt = Date.now();
    if (!tab.builtIn && contentBounds.width > 0 && contentBounds.height > 0) {
      platform.setTabBounds(tabId, contentBounds);
    }

    events.emit(TABS_ACTIVATED, { tabId, previousTabId });
    events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
    persistTab(tab);
  });

  commands.handle(TABS_NAVIGATE, async (payload) => {
    const tabId = payload.tabId ?? getActiveTabId();
    if (!tabId) return;
    const tab = tabs.get(tabId);
    if (!tab) return;

    tab.url = payload.url;
    tab.loading = true;
    await platform.navigateTab(tabId, payload.url);

    events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
    events.emit("tab:loading-changed", { tabId, loading: true });
    persistTab(tab);
  });

  commands.handle(TABS_TOGGLE_BOOKMARK, async (payload) => {
    const tabId = payload.tabId ?? getActiveTabId();
    if (!tabId) return;
    const tab = tabs.get(tabId);
    if (!tab) return;

    // Skip pinned tabs
    if (isPinned(tabId)) return;

    tab.bookmarked = !tab.bookmarked;
    if (tab.bookmarked) {
      fixedUrls.set(tabId, tab.url);
    } else {
      fixedUrls.delete(tabId);
      tab.folderId = null;
    }
    // Place at end of new section
    const siblingsInNewSection = [...tabs.values()].filter(
      (t) => t.workspaceId === tab.workspaceId && t.bookmarked === tab.bookmarked && t.id !== tabId,
    );
    const maxOrder = siblingsInNewSection.reduce((m, t) => Math.max(m, t.order), -1);
    tab.order = maxOrder + 1;
    events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
    scheduleListChanged();
    persistTab(tab);
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

  commands.handle(TABS_REORDER, async (payload) => {
    const { tabId, targetBookmarked, targetTabId, position, targetFolderId } = payload;
    const tab = tabs.get(tabId);
    if (!tab) return;

    // Skip pinned tabs
    if (isPinned(tabId)) return;

    // Auto-bookmark/unbookmark when moving between sections
    if (targetBookmarked && !tab.bookmarked) {
      tab.bookmarked = true;
      fixedUrls.set(tabId, tab.url);
    } else if (!targetBookmarked && tab.bookmarked) {
      tab.bookmarked = false;
      fixedUrls.delete(tabId);
    }

    // Update folder membership if specified
    if (targetFolderId !== undefined) {
      tab.folderId = targetFolderId;
    }

    // Per-level ordering: get sibling tabs at the same level (same folderId)
    const targetLevel = tab.folderId ?? null;
    const tabSiblings = [...tabs.values()]
      .filter(
        (t) =>
          t.workspaceId === tab.workspaceId &&
          t.bookmarked === targetBookmarked &&
          (t.folderId ?? null) === targetLevel &&
          t.id !== tabId,
      )
      .sort((a, b) => a.order - b.order);

    // Include folders at same level for unified ordering
    const folderSiblings = targetBookmarked ? getFoldersForLevel(tab.workspaceId, targetLevel) : [];

    type Item = { type: "tab"; tab: Tab } | { type: "folder"; id: FolderId; order: number };
    const items: Item[] = [
      ...tabSiblings.map((t) => ({ type: "tab" as const, tab: t })),
      ...folderSiblings.map((f) => ({ type: "folder" as const, id: f.id, order: f.order })),
    ].sort((a, b) => {
      const orderA = a.type === "tab" ? a.tab.order : a.order;
      const orderB = b.type === "tab" ? b.tab.order : b.order;
      if (orderA !== orderB) return orderA - orderB;
      // Tiebreaker: folders before tabs
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return 0;
    });

    // Determine insert index
    let insertAt = items.length; // default: append
    if (targetTabId) {
      const targetIdx = items.findIndex(
        (item) => item.type === "tab" && item.tab.id === targetTabId,
      );
      if (targetIdx !== -1) {
        insertAt = position === "after" ? targetIdx + 1 : targetIdx;
      }
    }

    // Splice the dragged tab into position and re-index all
    items.splice(insertAt, 0, { type: "tab", tab });
    for (const [i, item] of items.entries()) {
      if (item.type === "tab") {
        const orderChanged = item.tab.order !== i;
        item.tab.order = i;
        if (orderChanged || item.tab.id === tabId) {
          persistTab(item.tab);
        }
      } else if (item.order !== i) {
        setFolderOrder(item.id, i);
      }
    }

    events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
    scheduleListChanged();
  });

  commands.handle(TABS_REPORT_CONTENT_BOUNDS, async (payload) => {
    contentBounds = payload;
    const activeTabId = getActiveTabId();
    if (activeTabId) {
      const activeTab = tabs.get(activeTabId);
      if (!activeTab?.builtIn) {
        platform.setTabBounds(activeTabId, contentBounds);
      }
    }
  });

  platform.registerShortcut("CommandOrControl+B", () => {
    commands.send(TABS_TOGGLE_BOOKMARK, {}).catch(console.error);
  });
}

/** Returns oldId→newId and url→newId maps for cross-feature ID reconciliation */
export async function start(
  deps: Deps,
): Promise<{ idMap: Map<TabId, TabId>; urlMap: Map<string, TabId> }> {
  const { dataStore, platform, getActiveWindowId, getActiveWorkspaceId } = deps;
  const tabsCollection: Collection<PersistedTab> = dataStore.collection("tabs");

  const idMap = new Map<TabId, TabId>(); // old persisted ID → new platform ID
  const urlMap = new Map<string, TabId>(); // url → new platform ID

  // Restore persisted tabs
  const persisted = await tabsCollection.findMany({});
  if (persisted.length === 0) return { idMap, urlMap };

  const windowId = getActiveWindowId();
  if (!windowId) return { idMap, urlMap };

  const now = Date.now();

  // Ephemeral cleanup: remove tabs older than 8 hours
  const toRestore: PersistedTab[] = [];
  for (const pt of persisted) {
    if (!pt.bookmarked && now - pt.lastAccessedAt > EPHEMERAL_TTL_MS) {
      tabsCollection.remove(pt.id).catch(() => {});
    } else {
      toRestore.push(pt);
    }
  }

  if (toRestore.length === 0) return { idMap, urlMap };

  // Restore most recently accessed tab first so it becomes the active one
  toRestore.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

  if (!_tabs || !_attachTabListeners) {
    throw new Error("tabs.main: register() must be called before start()");
  }

  // Recreate tabs from persisted data
  const activeWsId = getActiveWorkspaceId();
  let firstTabInActiveWs: TabId | undefined;

  for (const pt of toRestore) {
    try {
      const tabId = await platform.createTab(windowId, pt.url);
      const tab: Tab = {
        id: tabId,
        workspaceId: pt.workspaceId as WorkspaceId,
        url: pt.url,
        title: pt.title,
        favicon: pt.favicon,
        loading: true,
        bookmarked: pt.bookmarked,
        lastAccessedAt: pt.lastAccessedAt,
        createdAt: pt.createdAt,
        order: pt.order,
        folderId: (pt.folderId as FolderId) ?? null,
      };

      _tabs.set(tabId, tab);
      _attachTabListeners(tabId);
      idMap.set(pt.id as TabId, tabId);
      urlMap.set(pt.url, tabId);
      if (pt.bookmarked) fixedUrls.set(tabId, pt.url);

      // Update persisted doc with new tabId (platform assigns new IDs)
      const { loading, ...newPersisted } = tab;
      await tabsCollection.upsert(newPersisted as PersistedTab).catch(console.error);
      await tabsCollection.remove(pt.id).catch(() => {});

      // Track first tab in active workspace for activation
      if (tab.workspaceId === activeWsId && !firstTabInActiveWs) {
        firstTabInActiveWs = tabId;
      }

      // Hide until activated
      platform.hideTab(tabId);
    } catch {
      // Skip tabs that fail to restore (e.g., invalid URLs)
    }
  }

  // Activate first tab in current workspace
  if (firstTabInActiveWs) {
    await deps.commands.send(TABS_ACTIVATE, { tabId: firstTabInActiveWs });
  }

  // Emit full list (enrich with fixedUrl for renderer)
  deps.events.emit(TABS_LIST_CHANGED, {
    tabs: [..._tabs.values()].map(tabSnapshot),
  });

  return { idMap, urlMap };
}

export function getTabsForWorkspace(workspaceId: WorkspaceId): Tab[] {
  if (!_tabs) return [];
  return [..._tabs.values()].filter((t) => t.workspaceId === workspaceId);
}

export function getTab(tabId: TabId): Tab | undefined {
  return _tabs?.get(tabId);
}

export function getAllTabs(): Map<TabId, Tab> {
  return _tabs ? new Map(_tabs) : new Map();
}

export function setTabFolderId(tabId: TabId, folderId: FolderId | null): void {
  if (!_tabs || !_persistTab) return;
  const tab = _tabs.get(tabId);
  if (!tab) return;
  tab.folderId = folderId;
  _persistTab(tab);
}

export function setTabOrder(tabId: TabId, order: number): void {
  if (!_tabs || !_persistTab) return;
  const tab = _tabs.get(tabId);
  if (!tab) return;
  tab.order = order;
  _persistTab(tab);
}
