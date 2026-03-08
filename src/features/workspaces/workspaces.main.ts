import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import type { Tab, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import {
  TABS_ACTIVATE,
  TABS_ACTIVATED,
  TABS_CLOSE,
  TABS_NAVIGATE,
  TABS_SET_WORKSPACE,
  TABS_UPDATED,
} from "../tabs/tabs.shared";
import {
  type PersistedWorkspace,
  WORKSPACES_CREATE,
  WORKSPACES_CREATED,
  WORKSPACES_DELETE,
  WORKSPACES_DELETED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_MOVE_TAB,
  WORKSPACES_RESTORE_TAB,
  WORKSPACES_SWITCH,
  WORKSPACES_SWITCHED,
  WORKSPACES_UPDATE,
  WORKSPACES_UPDATED,
  type Workspace,
  type WorkspacesCommands,
  type WorkspacesEvents,
} from "./workspaces.shared";

type AllCommands = WorkspacesCommands & TabsCommands;
type AllEvents = WorkspacesEvents & Pick<TabsEvents, typeof TABS_UPDATED | typeof TABS_ACTIVATED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  setActiveTabId: (tabId: TabId | undefined) => void;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
  setActiveWorkspaceId: (id: WorkspaceId) => void;
  getTabsForWorkspace: (workspaceId: WorkspaceId) => Tab[];
}

// Shared state exposed via accessor for cross-feature queries
const _workspaces = new Map<WorkspaceId, Workspace>();

// Track original URLs for restore-tab
const _originalUrls = new Map<TabId, string>();

export function getWorkspace(id: WorkspaceId): Workspace | undefined {
  return _workspaces.get(id);
}

export function getAllWorkspaces(): Workspace[] {
  return [..._workspaces.values()];
}

export default defineFeature<Deps>({
  register(deps) {
    const {
      commands,
      events,
      platform,
      dataStore,
      getActiveTabId,
      setActiveTabId,
      getActiveWorkspaceId,
      setActiveWorkspaceId,
      getTabsForWorkspace,
    } = deps;

    const wsCollection: Collection<PersistedWorkspace> = dataStore.collection("workspaces");
    _workspaces.clear();

    function emitListChanged(): void {
      events.emit(WORKSPACES_LIST_CHANGED, { workspaces: [..._workspaces.values()] });
    }

    function persistWorkspace(ws: Workspace, order: number): void {
      const persisted: PersistedWorkspace = {
        id: ws.id,
        name: ws.name,
        color: ws.color,
        icon: ws.icon,
        order,
      };
      wsCollection.update(ws.id, persisted).catch(() => {
        wsCollection.insert(persisted).catch(logError("workspaces", "persist"));
      });
    }

    // Track original URLs when tabs are first bookmarked
    events.on(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      if (tab.bookmarked && !_originalUrls.has(tab.id)) {
        _originalUrls.set(tab.id, tab.url);
      }
    });

    commands.handle(WORKSPACES_SWITCH, async (payload) => {
      const { workspaceId } = payload;
      const ws = _workspaces.get(workspaceId);
      if (!ws) return;

      const previousWsId = getActiveWorkspaceId() ?? null;
      if (previousWsId === workspaceId) return;

      // Save current ws active tab
      if (previousWsId) {
        const prevWs = _workspaces.get(previousWsId);
        if (prevWs) {
          prevWs.activeTabId = getActiveTabId() ?? null;
        }
      }

      // Hide all tabs
      platform.hideAllTabs();

      // Switch
      setActiveWorkspaceId(workspaceId);

      // Activate new ws's tab
      if (ws.activeTabId) {
        await commands.send(TABS_ACTIVATE, { tabId: ws.activeTabId });
      } else {
        const previousTabId = getActiveTabId() ?? null;
        setActiveTabId(undefined);
        events.emit(TABS_ACTIVATED, { tabId: null, previousTabId });
      }

      events.emit(WORKSPACES_SWITCHED, {
        workspaceId,
        previousWorkspaceId: previousWsId,
        workspaceName: ws.name,
      });
    });

    commands.handle(WORKSPACES_CREATE, async (payload) => {
      const id = crypto.randomUUID() as WorkspaceId;
      const ws: Workspace = {
        id,
        name: payload.name,
        color: payload.color,
        icon: payload.icon,
        activeTabId: null,
      };
      _workspaces.set(id, ws);
      persistWorkspace(ws, _workspaces.size - 1);

      events.emit(WORKSPACES_CREATED, { workspace: ws });
      emitListChanged();
      return id;
    });

    commands.handle(WORKSPACES_UPDATE, async (payload) => {
      const ws = _workspaces.get(payload.workspaceId);
      if (!ws) return;

      if (payload.changes.name !== undefined) ws.name = payload.changes.name;
      if (payload.changes.color !== undefined) ws.color = payload.changes.color;
      if (payload.changes.icon !== undefined) ws.icon = payload.changes.icon;

      // Find index for persistence
      const allWs = [..._workspaces.values()];
      const idx = allWs.findIndex((w) => w.id === ws.id);
      persistWorkspace(ws, idx >= 0 ? idx : _workspaces.size - 1);

      events.emit(WORKSPACES_UPDATED, { workspace: ws });
      emitListChanged();
    });

    commands.handle(WORKSPACES_DELETE, async (payload) => {
      const { workspaceId } = payload;
      if (_workspaces.size <= 1) return; // Can't delete last workspace

      const ws = _workspaces.get(workspaceId);
      if (!ws) return;

      // Find default workspace (first one that isn't being deleted)
      let defaultWsId: WorkspaceId | undefined;
      for (const w of _workspaces.values()) {
        if (w.id !== workspaceId) {
          defaultWsId = w.id;
          break;
        }
      }
      if (!defaultWsId) return;

      // Move tabs to default workspace via command (avoids mutating external Tab objects)
      const tabsInWs = getTabsForWorkspace(workspaceId);
      for (const tab of tabsInWs) {
        await commands.send(TABS_SET_WORKSPACE, { tabId: tab.id, workspaceId: defaultWsId });
      }

      // If deleting active workspace, switch to default
      if (getActiveWorkspaceId() === workspaceId) {
        _workspaces.delete(workspaceId);
        await commands.send(WORKSPACES_SWITCH, { workspaceId: defaultWsId });
      } else {
        _workspaces.delete(workspaceId);
      }

      wsCollection.remove(workspaceId).catch(logError("workspaces", "remove"));

      events.emit(WORKSPACES_DELETED, { workspaceId });
      emitListChanged();
    });

    commands.handle(WORKSPACES_MOVE_TAB, async (payload) => {
      const { targetWorkspaceId } = payload;
      const targetWs = _workspaces.get(targetWorkspaceId);
      if (!targetWs) return;

      const tabId = getActiveTabId();
      if (!tabId) return;

      // Update tab's workspace (access internal tab map via getTabsForWorkspace workaround)
      const currentWsId = getActiveWorkspaceId();
      if (!currentWsId || currentWsId === targetWorkspaceId) return;

      const allTabs = getTabsForWorkspace(currentWsId);
      const tab = allTabs.find((t) => t.id === tabId);
      if (!tab) return;

      await commands.send(TABS_SET_WORKSPACE, { tabId, workspaceId: targetWorkspaceId });

      // Hide tab since it's moving to another workspace
      platform.hideTab(tabId);

      // Activate MRU in current workspace
      const remaining = allTabs.filter((t) => t.id !== tabId);
      if (remaining.length > 0) {
        const mru = remaining.reduce((best, t) =>
          t.lastAccessedAt > best.lastAccessedAt ? t : best,
        );
        await commands.send(TABS_ACTIVATE, { tabId: mru.id });
      } else {
        setActiveTabId(undefined);
      }
    });

    commands.handle(WORKSPACES_RESTORE_TAB, async () => {
      const tabId = getActiveTabId();
      if (!tabId) return;

      const originalUrl = _originalUrls.get(tabId);
      if (!originalUrl) return;

      await commands.send(TABS_NAVIGATE, { url: originalUrl, tabId });
    });

    // ── Keyboard shortcuts ──────────────────────────────────────────
    // Ctrl+W: Close current tab
    platform.registerShortcut("CommandOrControl+W", () => {
      const tabId = getActiveTabId();
      if (tabId)
        commands.send(TABS_CLOSE, { tabId }).catch(logError("workspaces", "close tab shortcut"));
    });

    // Ctrl+1..9: Switch to workspace N
    for (let n = 1; n <= 9; n++) {
      platform.registerShortcut(`CommandOrControl+${n}`, () => {
        const all = getAllWorkspaces();
        const ws = all[n - 1];
        if (ws)
          commands
            .send(WORKSPACES_SWITCH, { workspaceId: ws.id })
            .catch(logError("workspaces", "switch shortcut"));
      });
    }

    // Ctrl+Shift+1..9: Move current tab to workspace N
    for (let n = 1; n <= 9; n++) {
      platform.registerShortcut(`CommandOrControl+Shift+${n}`, () => {
        const all = getAllWorkspaces();
        const ws = all[n - 1];
        if (ws)
          commands
            .send(WORKSPACES_MOVE_TAB, { targetWorkspaceId: ws.id })
            .catch(logError("workspaces", "move tab shortcut"));
      });
    }
  },
});

export async function start(deps: Deps): Promise<void> {
  const { events, dataStore, setActiveWorkspaceId } = deps;
  const wsCollection: Collection<PersistedWorkspace> = dataStore.collection("workspaces");

  // Restore persisted workspaces
  const persisted = await wsCollection.findMany({
    sort: [{ field: "order", direction: "asc" }],
  });

  if (persisted.length > 0) {
    for (const pw of persisted) {
      const ws: Workspace = {
        id: pw.id as WorkspaceId,
        name: pw.name,
        color: pw.color,
        icon: pw.icon,
        activeTabId: null,
      };
      _workspaces.set(ws.id, ws);
    }

    const firstWs = persisted[0] as (typeof persisted)[number];
    setActiveWorkspaceId(firstWs.id as WorkspaceId);

    events.emit(WORKSPACES_LIST_CHANGED, {
      workspaces: [..._workspaces.values()],
    });
  } else {
    // Create default workspace
    const defaultId = crypto.randomUUID() as WorkspaceId;
    const defaultWs: Workspace = {
      id: defaultId,
      name: "Work",
      color: "oklch(0.6 0.12 230)",
      icon: "W",
      activeTabId: null,
    };
    _workspaces.set(defaultId, defaultWs);
    setActiveWorkspaceId(defaultId);

    // Persist default
    wsCollection
      .insert({ id: defaultId, name: "Work", color: "oklch(0.6 0.12 230)", icon: "W", order: 0 })
      .catch(logError("workspaces", "create default"));

    events.emit(WORKSPACES_CREATED, { workspace: defaultWs });
    events.emit(WORKSPACES_LIST_CHANGED, {
      workspaces: [..._workspaces.values()],
    });
  }
}
