import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import { defineFeature } from "../../shared/define-feature";
import { PersistedMap } from "../../shared/persisted-map";
import type { FolderId, TabId, WorkspaceId } from "../../shared/types";
import type { Tab } from "../tabs/tabs.shared";
import type { TabsEvents } from "../tabs/tabs.shared";
import { TABS_LIST_CHANGED, TABS_UPDATED } from "../tabs/tabs.shared";
import {
  FOLDERS_CHANGED,
  FOLDERS_CREATE,
  FOLDERS_GET_FOR_LEVEL,
  FOLDERS_REMOVE,
  FOLDERS_RENAME,
  FOLDERS_RENAME_REQUESTED,
  FOLDERS_REORDER,
  FOLDERS_SET_ORDER,
  FOLDERS_TOGGLE,
  FOLDERS_TOGGLE_COLLAPSE,
  type Folder,
  type FoldersCommands,
  type FoldersEvents,
  type PersistedFolder,
} from "./folders.shared";

type AllCommands = FoldersCommands;
type AllEvents = FoldersEvents & Pick<TabsEvents, typeof TABS_UPDATED | typeof TABS_LIST_CHANGED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  dataStore: DataStore;
  getActiveTabId: () => TabId | undefined;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
  getTab: (tabId: TabId) => Tab | undefined;
  getTabsForWorkspace: (workspaceId: WorkspaceId) => Tab[];
  setTabFolderId: (tabId: TabId, folderId: FolderId | null) => void;
  setTabOrder: (tabId: TabId, order: number) => void;
}

let _folders: PersistedMap<FolderId, Folder, PersistedFolder> | undefined;
let _setFolderOrder: ((folderId: FolderId, order: number) => void) | undefined;

export default defineFeature<Deps>({
  register(deps) {
    const {
      commands,
      events,
      dataStore,
      getActiveTabId,
      getActiveWorkspaceId,
      getTab,
      getTabsForWorkspace,
      setTabFolderId,
      setTabOrder,
    } = deps;

    const folders = new PersistedMap<FolderId, Folder, PersistedFolder>(
      dataStore.collection("folders"),
      {
        serialize: (_key, folder) => ({
          id: folder.id,
          workspaceId: folder.workspaceId,
          name: folder.name,
          parentFolderId: folder.parentFolderId,
          collapsed: folder.collapsed,
          order: folder.order,
        }),
        deserialize: (pf) => [
          pf.id as FolderId,
          {
            id: pf.id as FolderId,
            workspaceId: pf.workspaceId as WorkspaceId,
            name: pf.name,
            parentFolderId: pf.parentFolderId as FolderId | null,
            collapsed: pf.collapsed,
            order: pf.order,
          },
        ],
        source: "folders",
      },
    );
    _folders = folders;

    function emitChanged(): void {
      events.emit(FOLDERS_CHANGED, { folders: folders.values() });
    }

    function nextOrderForLevel(workspaceId: WorkspaceId, parentFolderId: FolderId | null): number {
      const folderOrders = folders
        .values()
        .filter((f) => f.workspaceId === workspaceId && f.parentFolderId === parentFolderId)
        .map((f) => f.order);
      const tabOrders = getTabsForWorkspace(workspaceId)
        .filter((t) => t.bookmarked && (t.folderId ?? null) === parentFolderId)
        .map((t) => t.order);
      return Math.max(-1, ...folderOrders, ...tabOrders) + 1;
    }

    _setFolderOrder = (folderId: FolderId, order: number) => {
      const folder = folders.get(folderId);
      if (!folder || folder.order === order) return;
      folders.set(folder.id, { ...folder, order });
      emitChanged();
    };

    // ── Command handlers ───────────────────────────────────────────

    commands.handle(FOLDERS_TOGGLE, async (payload) => {
      const tabId = (payload.tabId as TabId) ?? getActiveTabId();
      if (!tabId) return;
      const tab = getTab(tabId);
      if (!tab || !tab.bookmarked) return;

      if (tab.folderId) {
        // Remove tab from folder
        const oldFolderId = tab.folderId;
        const folder = folders.get(oldFolderId);
        // Move tab to folder's parent (or root) with correct order
        const targetParentId = folder?.parentFolderId ?? null;
        setTabFolderId(tabId, targetParentId);
        setTabOrder(tabId, nextOrderForLevel(tab.workspaceId, targetParentId));
        const updatedTab = getTab(tabId);
        if (updatedTab) {
          events.emit(TABS_UPDATED, { tab: { ...updatedTab } });
        }
        events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(tab.workspaceId) });
      } else {
        // Create new folder containing this tab
        const folderId = crypto.randomUUID() as FolderId;
        const folderOrders = folders
          .values()
          .filter((f) => f.workspaceId === tab.workspaceId && f.parentFolderId === null)
          .map((f) => f.order);
        const tabOrders = getTabsForWorkspace(tab.workspaceId)
          .filter((t) => t.bookmarked && (t.folderId ?? null) === null && t.id !== tabId)
          .map((t) => t.order);
        const maxOrder = Math.max(-1, ...folderOrders, ...tabOrders);

        const folder: Folder = {
          id: folderId,
          workspaceId: tab.workspaceId,
          name: "New Folder",
          parentFolderId: null,
          collapsed: false,
          order: maxOrder + 1,
        };

        folders.set(folderId, folder);
        setTabFolderId(tabId, folderId);
        setTabOrder(tabId, 0);
        const updatedTab2 = getTab(tabId);
        if (updatedTab2) {
          events.emit(TABS_UPDATED, { tab: { ...updatedTab2 } });
        }
        events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(tab.workspaceId) });
        // Emit rename-requested BEFORE folders-changed so renamingFolderId is set
        // when the folder first renders (prevents race on slow CI).
        events.emit(FOLDERS_RENAME_REQUESTED, { folderId });
        emitChanged();
      }
    });

    commands.handle(FOLDERS_RENAME, async (payload) => {
      const folder = folders.get(payload.folderId);
      if (!folder) return;
      folders.set(folder.id, { ...folder, name: payload.name });
      emitChanged();
    });

    commands.handle(FOLDERS_TOGGLE_COLLAPSE, async (payload) => {
      const folder = folders.get(payload.folderId);
      if (!folder) return;
      folders.set(folder.id, { ...folder, collapsed: !folder.collapsed });
      emitChanged();
    });

    commands.handle(FOLDERS_REMOVE, async (payload) => {
      const folder = folders.get(payload.folderId);
      if (!folder) return;

      // Move contained tabs to parent folder (or root) with correct order
      const targetParentId = folder.parentFolderId ?? null;
      const tabsInFolder = getTabsForWorkspace(folder.workspaceId).filter(
        (t) => t.folderId === folder.id,
      );
      let order = nextOrderForLevel(folder.workspaceId, targetParentId);
      for (const tab of tabsInFolder) {
        setTabFolderId(tab.id, targetParentId);
        setTabOrder(tab.id, order++);
      }

      // Promote child folders to parent level
      for (const child of folders.values()) {
        if (child.parentFolderId === folder.id) {
          folders.set(child.id, { ...child, parentFolderId: targetParentId, order: order++ });
        }
      }

      folders.delete(folder.id);

      if (tabsInFolder.length > 0) {
        events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(folder.workspaceId) });
      }
      emitChanged();
    });

    commands.handle(FOLDERS_REORDER, async (payload) => {
      const existing = folders.get(payload.folderId);
      if (!existing) return;

      // Work with a copy to avoid mutating the stored object
      let folder: Folder = { ...existing };

      // Update parent if specified
      if (payload.parentFolderId !== undefined) {
        // Prevent circular nesting (can't nest a folder into itself or its descendants)
        if (payload.parentFolderId !== null) {
          let ancestor = folders.get(payload.parentFolderId);
          let depth = 0;
          while (ancestor && depth++ < folders.size) {
            if (ancestor.id === folder.id) return; // circular
            ancestor = ancestor.parentFolderId ? folders.get(ancestor.parentFolderId) : undefined;
          }
        }
        folder = { ...folder, parentFolderId: payload.parentFolderId };
      }

      // Unified ordering: include both folders and tabs at the target level
      const folderSiblings = folders
        .values()
        .filter(
          (f) =>
            f.workspaceId === folder.workspaceId &&
            f.parentFolderId === folder.parentFolderId &&
            f.id !== folder.id,
        )
        .sort((a, b) => a.order - b.order);

      const tabSiblings = getTabsForWorkspace(folder.workspaceId).filter(
        (t) => t.bookmarked && (t.folderId ?? null) === folder.parentFolderId,
      );

      type Item =
        | { type: "folder"; folder: Folder }
        | { type: "tab"; tab: (typeof tabSiblings)[0] };
      const items: Item[] = [
        ...folderSiblings.map((f) => ({ type: "folder" as const, folder: f })),
        ...tabSiblings.map((t) => ({ type: "tab" as const, tab: t })),
      ].sort((a, b) => {
        const orderA = a.type === "folder" ? a.folder.order : a.tab.order;
        const orderB = b.type === "folder" ? b.folder.order : b.tab.order;
        if (orderA !== orderB) return orderA - orderB;
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return 0;
      });

      // Determine insert index
      let insertAt = items.length;
      if (payload.targetFolderId) {
        const targetIdx = items.findIndex(
          (item) => item.type === "folder" && item.folder.id === payload.targetFolderId,
        );
        if (targetIdx !== -1) {
          insertAt = payload.position === "after" ? targetIdx + 1 : targetIdx;
        }
      } else if (payload.targetTabId) {
        const targetIdx = items.findIndex(
          (item) => item.type === "tab" && item.tab.id === payload.targetTabId,
        );
        if (targetIdx !== -1) {
          insertAt = payload.position === "after" ? targetIdx + 1 : targetIdx;
        }
      }

      // Splice and re-index all items at the level
      items.splice(insertAt, 0, { type: "folder", folder });
      let tabsReordered = false;
      for (const [i, item] of items.entries()) {
        if (item.type === "folder") {
          // Always persist the reordered folder (parentFolderId may have changed)
          if (item.folder.order === i && item.folder.id !== folder.id) continue;
          folders.set(item.folder.id, { ...item.folder, order: i });
        } else if (item.tab.order !== i) {
          setTabOrder(item.tab.id, i);
          tabsReordered = true;
        }
      }

      if (tabsReordered) {
        events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(folder.workspaceId) });
      }
      emitChanged();
    });

    commands.handle(FOLDERS_CREATE, async (payload) => {
      const workspaceId = (payload.workspaceId as WorkspaceId) ?? getActiveWorkspaceId();
      if (!workspaceId) return;

      const parentFolderId = (payload.parentFolderId as FolderId | null) ?? null;
      const folderOrders = folders
        .values()
        .filter((f) => f.workspaceId === workspaceId && f.parentFolderId === parentFolderId)
        .map((f) => f.order);
      const tabOrders = getTabsForWorkspace(workspaceId)
        .filter((t) => t.bookmarked && (t.folderId ?? null) === parentFolderId)
        .map((t) => t.order);
      const maxOrder = Math.max(-1, ...folderOrders, ...tabOrders);

      const folderId = crypto.randomUUID() as FolderId;
      const folder: Folder = {
        id: folderId,
        workspaceId,
        name: "New Folder",
        parentFolderId,
        collapsed: false,
        order: maxOrder + 1,
      };

      folders.set(folderId, folder);
      events.emit(FOLDERS_RENAME_REQUESTED, { folderId });
      emitChanged();
    });

    commands.handle(FOLDERS_GET_FOR_LEVEL, (payload) =>
      folders
        .values()
        .filter(
          (f) =>
            f.workspaceId === payload.workspaceId && f.parentFolderId === payload.parentFolderId,
        ),
    );

    commands.handle(FOLDERS_SET_ORDER, (payload) => {
      const folder = folders.get(payload.folderId);
      if (!folder || folder.order === payload.order) return;
      folders.set(folder.id, { ...folder, order: payload.order });
      emitChanged();
    });
  },
});

export async function start(deps: Deps): Promise<void> {
  const { events } = deps;
  if (!_folders) throw new Error("folders.main: register() must be called before start()");
  await _folders.load();
  if (_folders.size > 0) {
    events.emit(FOLDERS_CHANGED, { folders: _folders.values() });
  }
}

export function getFoldersForWorkspace(workspaceId: WorkspaceId): Folder[] {
  if (!_folders) return [];
  return _folders.values().filter((f) => f.workspaceId === workspaceId);
}

export function getFoldersForLevel(
  workspaceId: WorkspaceId,
  parentFolderId: FolderId | null,
): Folder[] {
  if (!_folders) return [];
  return _folders
    .values()
    .filter((f) => f.workspaceId === workspaceId && f.parentFolderId === parentFolderId);
}

export function setFolderOrder(folderId: FolderId, order: number): void {
  if (!_folders || !_setFolderOrder) return;
  _setFolderOrder(folderId, order);
}
