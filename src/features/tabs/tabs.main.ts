import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Bounds, Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { featureState } from "../../shared/feature-state";
import { logError, logWarn } from "../../shared/log";
import { TabScope } from "../../shared/tab-scope";
import type { FolderId, TabId, WindowId, WorkspaceId } from "../../shared/types";
import type {
  TAB_LOADING_CHANGED,
  TabLoadingChangedPayload,
} from "../window-chrome/window-chrome.shared";
import {
  type PersistedTab,
  TABS_ACTIVATE,
  TABS_ACTIVATED,
  TABS_ADOPT,
  TABS_CLEAR_EPHEMERAL,
  TABS_CLOSE,
  TABS_CLOSED,
  TABS_CONTENT_BOUNDS_CHANGED,
  TABS_CREATE,
  TABS_CREATED,
  TABS_GET,
  TABS_GET_FOR_WORKSPACE,
  TABS_LIST_CHANGED,
  TABS_NAVIGATE,
  TABS_REORDER,
  TABS_REPORT_CONTENT_BOUNDS,
  TABS_SET_FOLDER_ID,
  TABS_SET_ORDER,
  TABS_SET_WORKSPACE,
  TABS_TOGGLE_BOOKMARK,
  TABS_UPDATED,
  type Tab,
  type TabsCommands,
  type TabsEvents,
} from "./tabs.shared";

type AllCommands = TabsCommands;
type AllEvents = TabsEvents & { [K in typeof TAB_LOADING_CHANGED]: TabLoadingChangedPayload };

const EPHEMERAL_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1" ||
      u.hostname.startsWith("127.") ||
      u.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  setActiveTabId: (tabId: TabId | undefined) => void;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
  isPinned: (tabId: TabId) => boolean;
  getCustomization: (tabId: TabId) => { fixedAddressDisabled: boolean } | undefined;
  getFoldersForLevel: (
    workspaceId: WorkspaceId,
    parentFolderId: FolderId | null,
  ) => { id: FolderId; order: number }[];
  setFolderOrder: (folderId: FolderId, order: number) => void;
  isPrivacyWorkspace: (id: WorkspaceId) => boolean;
}

function resolveBuiltInTitle(url: string): string {
  const titles: Record<string, string> = {
    "app:settings": "Settings",
    "app:tab-customization": "Tab Customization",
  };
  if (titles[url]) return titles[url];
  // Handle parameterized URLs like app:domain-settings?domain=github.com
  const qIndex = url.indexOf("?");
  if (qIndex !== -1) {
    const base = url.slice(0, qIndex);
    if (base === "app:domain-settings") {
      const params = new URLSearchParams(url.slice(qIndex + 1));
      const domain = params.get("domain");
      return domain ? `Customization: ${domain}` : "Customization";
    }
    if (base === "app:tab-customization") {
      return "Tab Customization";
    }
    if (base === "app:pdf-reader") {
      const params = new URLSearchParams(url.slice(qIndex + 1));
      const pdfUrl = params.get("url");
      if (pdfUrl) {
        try {
          const pathname = new URL(pdfUrl).pathname;
          const filename = decodeURIComponent(pathname.split("/").pop() || "");
          // Strip .pdf extension and replace underscores with spaces
          return filename.replace(/\.pdf$/i, "").replace(/_/g, " ") || "PDF";
        } catch {
          return "PDF";
        }
      }
      return "PDF";
    }
  }
  return url;
}

const _state = featureState<{
  tabs: Map<TabId, Tab>;
  attachTabListeners: (tabId: TabId) => void;
  persistTab: (tab: Tab) => void;
}>("tabs");

// Module-level content bounds for cross-feature access
let _contentBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };

let builtInCounter = 0;

// Tracks the "fixed" URL for bookmarked tabs (URL at time of bookmarking).
// Used to restore bookmarked tabs to their original address unless
// fixedAddressDisabled is set.
const fixedUrls = new Map<TabId, string>();

// Tabs restored at startup that haven't loaded their URL yet (lazy loading).
const unloadedTabs = new Set<TabId>();

/** Spread a tab with its fixedUrl for event emission. */
function tabSnapshot(tab: Tab): Tab {
  const fixedUrl = fixedUrls.get(tab.id);
  return { ...tab, ...(fixedUrl ? { fixedUrl } : {}) };
}

export default defineFeature<Deps>({
  register(deps) {
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
      isPinned,
      getCustomization,
      getFoldersForLevel,
      setFolderOrder,
      isPrivacyWorkspace,
    } = deps;

    const tabs = new Map<TabId, Tab>();
    let contentBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
    const tabScope = new TabScope();
    const tabsCollection: Collection<PersistedTab> = dataStore.collection("tabs");
    builtInCounter = 0;

    // ── Persistence helpers ──────────────────────────────────────────

    function persistTab(tab: Tab): void {
      if (tab.builtIn && !tab.url.startsWith("app:pdf-reader")) return;
      // Ephemeral tabs in privacy-mode workspaces are never persisted
      if (!tab.bookmarked && isPrivacyWorkspace(tab.workspaceId)) {
        removePersistedTab(tab.id);
        return;
      }
      const { loading, builtIn, fixedUrl: _fixedUrl, ...persisted } = tab;
      // Bookmarked tabs with fixed address: persist the original URL
      const fixedUrl = fixedUrls.get(tab.id);
      if (tab.bookmarked && fixedUrl && !getCustomization(tab.id)?.fixedAddressDisabled) {
        (persisted as PersistedTab).url = fixedUrl;
      }
      tabsCollection.upsert(persisted as PersistedTab).catch(logError("tabs", "persist tab"));
    }

    function removePersistedTab(tabId: TabId): void {
      tabsCollection.remove(tabId).catch(logWarn("tabs", "remove persisted tab"));
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
      tabScope.add(
        tabId,
        platform.onTabEvent(tabId, "page-title-updated", (_event, title) => {
          const tab = tabs.get(tabId);
          if (!tab || typeof title !== "string") return;
          tab.title = title;
          events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
          persistTab(tab);
        }),
      );

      tabScope.add(
        tabId,
        platform.onTabEvent(tabId, "did-navigate", (_event, url) => {
          const tab = tabs.get(tabId);
          if (!tab || typeof url !== "string") return;
          tab.url = url;
          events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
          persistTab(tab);
        }),
      );

      tabScope.add(
        tabId,
        platform.onTabEvent(tabId, "did-navigate-in-page", (_event, url) => {
          const tab = tabs.get(tabId);
          if (!tab || typeof url !== "string") return;
          tab.url = url;
          events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
          persistTab(tab);
        }),
      );

      tabScope.add(
        tabId,
        platform.onTabEvent(tabId, "did-start-loading", () => {
          const tab = tabs.get(tabId);
          if (!tab) return;
          tab.loading = true;
          events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
          events.emit("tab:loading-changed", { tabId, loading: true });
        }),
      );

      tabScope.add(
        tabId,
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

      tabScope.add(
        tabId,
        platform.onTabEvent(tabId, "page-favicon-updated", (_event, favicons) => {
          const tab = tabs.get(tabId);
          if (!tab || !Array.isArray(favicons)) return;
          const urls = favicons as string[];
          if (urls.length > 0 && typeof urls[0] === "string") {
            const faviconUrl = urls[0];
            tab.favicon = faviconUrl;
            events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
            persistTab(tab);
            // Convert localhost favicons to data URLs so they survive across sessions
            // (dev servers aren't running until the tab is activated)
            if (isLocalhostUrl(faviconUrl)) {
              platform
                .fetchAsDataUrl(faviconUrl)
                .then((dataUrl) => {
                  if (!dataUrl) return;
                  const current = tabs.get(tabId);
                  if (!current || current.favicon !== faviconUrl) return;
                  current.favicon = dataUrl;
                  events.emit(TABS_UPDATED, { tab: tabSnapshot(current) });
                  persistTab(current);
                })
                .catch(logError("tabs", "fetch favicon as data url"));
            }
          }
        }),
      );
    }

    // Expose for getTabsForWorkspace, start(), and cross-feature accessors
    _state.init({ tabs, attachTabListeners, persistTab });

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
        events.emit("tab:loading-changed", { tabId, loading: true });
      }
      persistTab(tab);

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
      tabScope.cleanup(tabId);

      const wasActive = getActiveTabId() === tabId;
      if (!tab.builtIn) {
        await platform.closeTab(tabId);
      }
      removePersistedTab(tabId);
      tabs.delete(tabId);
      fixedUrls.delete(tabId);
      unloadedTabs.delete(tabId);

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

      // Load URL if this tab was restored lazily and hasn't loaded yet
      if (unloadedTabs.has(tabId)) {
        unloadedTabs.delete(tabId);
        tab.loading = true;
        await platform.navigateTab(tabId, tab.url);
        events.emit("tab:loading-changed", { tabId, loading: true });
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
        (t) =>
          t.workspaceId === tab.workspaceId && t.bookmarked === tab.bookmarked && t.id !== tabId,
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
        tab.folderId = null;
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
      const folderSiblings = targetBookmarked
        ? getFoldersForLevel(tab.workspaceId, targetLevel)
        : [];

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
      _contentBounds = { ...contentBounds };
      events.emit(TABS_CONTENT_BOUNDS_CHANGED, { ...contentBounds });
      const activeTabId = getActiveTabId();
      if (activeTabId) {
        const activeTab = tabs.get(activeTabId);
        if (!activeTab?.builtIn) {
          platform.setTabBounds(activeTabId, contentBounds);
        }
      }
    });

    commands.handle(TABS_GET, (payload) => tabs.get(payload.tabId));
    commands.handle(TABS_GET_FOR_WORKSPACE, (payload) =>
      [...tabs.values()].filter((t) => t.workspaceId === payload.workspaceId).map(tabSnapshot),
    );
    commands.handle(TABS_SET_FOLDER_ID, (payload) => {
      const tab = tabs.get(payload.tabId);
      if (!tab) return;
      tab.folderId = payload.folderId;
      persistTab(tab);
    });
    commands.handle(TABS_SET_ORDER, (payload) => {
      const tab = tabs.get(payload.tabId);
      if (!tab) return;
      tab.order = payload.order;
      persistTab(tab);
    });
    commands.handle(TABS_SET_WORKSPACE, (payload) => {
      const tab = tabs.get(payload.tabId);
      if (!tab) return;
      tab.workspaceId = payload.workspaceId;
      events.emit(TABS_UPDATED, { tab: tabSnapshot(tab) });
      scheduleListChanged();
      persistTab(tab);
    });

    // Adopt an existing WebContentsView as a tab (used by sub-tab promotion)
    commands.handle(TABS_ADOPT, async (payload) => {
      const { tabId, activate } = payload;
      const workspaceId = payload.workspaceId ?? getActiveWorkspaceId();
      if (!workspaceId) throw new Error("No active workspace");

      const url = platform.getTabUrl(tabId) ?? "";
      const title = platform.getTabTitle(tabId) ?? url;
      const now = Date.now();

      const tab: Tab = {
        id: tabId,
        workspaceId,
        url,
        title,
        favicon: "",
        loading: false,
        bookmarked: false,
        lastAccessedAt: now,
        createdAt: now,
        order: tabs.size,
        folderId: null,
      };

      tabs.set(tabId, tab);
      attachTabListeners(tabId);
      persistTab(tab);

      events.emit(TABS_CREATED, { tab });
      scheduleListChanged();

      if (activate !== false) {
        await commands.send(TABS_ACTIVATE, { tabId });
      }

      return tabId;
    });

    const toggleBookmark = () => {
      commands.send(TABS_TOGGLE_BOOKMARK, {}).catch(logError("tabs", "toggle bookmark shortcut"));
    };
    platform.registerShortcut("CommandOrControl+B", toggleBookmark);
    platform.registerLocalShortcut("CommandOrControl+B", toggleBookmark);
  },
  teardown() {
    _state.reset();
    fixedUrls.clear();
    unloadedTabs.clear();
  },
});

export async function start(deps: Deps): Promise<void> {
  const { dataStore, platform, getActiveWindowId, getActiveWorkspaceId, isPrivacyWorkspace } = deps;
  const tabsCollection: Collection<PersistedTab> = dataStore.collection("tabs");

  const persisted = await tabsCollection.findMany({});
  if (persisted.length === 0) return;

  const windowId = getActiveWindowId();
  if (!windowId) return;

  const now = Date.now();

  // Ephemeral cleanup: remove tabs older than 8 hours or in privacy workspaces
  const toRestore: PersistedTab[] = [];
  for (const pt of persisted) {
    const inPrivacyWs = isPrivacyWorkspace(pt.workspaceId as WorkspaceId);
    if (!pt.bookmarked && (now - pt.lastAccessedAt > EPHEMERAL_TTL_MS || inPrivacyWs)) {
      tabsCollection.remove(pt.id).catch(logWarn("tabs", "remove expired ephemeral"));
    } else {
      toRestore.push(pt);
    }
  }

  if (toRestore.length === 0) return;

  // Restore most recently accessed tab first so it becomes the active one
  toRestore.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

  const { tabs, attachTabListeners } = _state.get();

  // Recreate tabs with their original stable IDs
  const activeWsId = getActiveWorkspaceId();
  let firstTabInActiveWs: TabId | undefined;

  for (const pt of toRestore) {
    try {
      const tabId = pt.id as TabId;
      const isBuiltIn = pt.url.startsWith("app:");

      if (!isBuiltIn) {
        await platform.createTab(windowId, pt.url, tabId, { lazy: true });
      } else {
        // Update counter to avoid ID collisions with restored built-in tabs
        const match = tabId.match(/^builtin-(\d+)$/);
        if (match) builtInCounter = Math.max(builtInCounter, Number(match[1]));
      }

      const tab: Tab = {
        id: tabId,
        workspaceId: pt.workspaceId as WorkspaceId,
        url: pt.url,
        title: isBuiltIn ? resolveBuiltInTitle(pt.url) : pt.title,
        favicon: pt.favicon,
        loading: false,
        bookmarked: pt.bookmarked,
        ...(isBuiltIn && { builtIn: true }),
        lastAccessedAt: pt.lastAccessedAt,
        createdAt: pt.createdAt,
        order: pt.order,
        folderId: (pt.folderId as FolderId) ?? null,
      };

      tabs.set(tabId, tab);
      if (!isBuiltIn) {
        attachTabListeners(tabId);
        unloadedTabs.add(tabId);
        platform.hideTab(tabId);
      }
      if (pt.bookmarked) fixedUrls.set(tabId, pt.url);

      // Track first tab in active workspace for activation
      if (tab.workspaceId === activeWsId && !firstTabInActiveWs) {
        firstTabInActiveWs = tabId;
      }
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
    tabs: [...tabs.values()].map(tabSnapshot),
  });
}

export function getTabsForWorkspace(workspaceId: WorkspaceId): Tab[] {
  if (!_state.initialized) return [];
  return [..._state.get().tabs.values()].filter((t) => t.workspaceId === workspaceId);
}

export function getTab(tabId: TabId): Tab | undefined {
  return _state.initialized ? _state.get().tabs.get(tabId) : undefined;
}

export function getAllTabs(): Map<TabId, Tab> {
  return _state.initialized ? new Map(_state.get().tabs) : new Map();
}

export function setTabFolderId(tabId: TabId, folderId: FolderId | null): void {
  if (!_state.initialized) return;
  const { tabs, persistTab } = _state.get();
  const tab = tabs.get(tabId);
  if (!tab) return;
  tab.folderId = folderId;
  persistTab(tab);
}

export function setTabOrder(tabId: TabId, order: number): void {
  if (!_state.initialized) return;
  const { tabs, persistTab } = _state.get();
  const tab = tabs.get(tabId);
  if (!tab) return;
  tab.order = order;
  persistTab(tab);
}

export function getContentBounds(): Bounds {
  return { ..._contentBounds };
}
