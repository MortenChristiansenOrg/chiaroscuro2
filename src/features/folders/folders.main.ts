import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { FolderId, TabId, WorkspaceId } from "../../shared/types";
import { getTab, getTabsForWorkspace, setTabFolderId, setTabOrder } from "../tabs/tabs.main";
import type { TabsEvents } from "../tabs/tabs.shared";
import { TABS_LIST_CHANGED, TABS_UPDATED } from "../tabs/tabs.shared";
import {
  FOLDERS_CHANGED,
  FOLDERS_CREATE,
  FOLDERS_REMOVE,
  FOLDERS_RENAME,
  FOLDERS_RENAME_REQUESTED,
  FOLDERS_REORDER,
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
}

let _folders: Map<FolderId, Folder> | undefined;
let _setFolderOrder: ((folderId: FolderId, order: number) => void) | undefined;

export function register(deps: Deps): void {
  const { commands, events, dataStore, getActiveTabId, getActiveWorkspaceId } = deps;

  const folders = new Map<FolderId, Folder>();
  _folders = folders;
  const foldersCollection: Collection<PersistedFolder> = dataStore.collection("folders");

  // ── Persistence helpers ──────────────────────────────────────────

  function persistFolder(folder: Folder): void {
    const persisted: PersistedFolder = {
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      collapsed: folder.collapsed,
      order: folder.order,
    };
    foldersCollection.upsert(persisted).catch(console.error);
  }

  function removePersistedFolder(folderId: FolderId): void {
    foldersCollection.remove(folderId).catch(() => {});
  }

  function emitChanged(): void {
    events.emit(FOLDERS_CHANGED, { folders: [...folders.values()] });
  }

  _setFolderOrder = (folderId: FolderId, order: number) => {
    const folder = folders.get(folderId);
    if (!folder) return;
    folder.order = order;
    persistFolder(folder);
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
      // Move tab to folder's parent (or root)
      setTabFolderId(tabId, folder?.parentFolderId ?? null);
      const updatedTab = getTab(tabId);
      if (updatedTab) {
        events.emit(TABS_UPDATED, { tab: { ...updatedTab } });
      }
      events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(tab.workspaceId) });
    } else {
      // Create new folder containing this tab
      const folderId = crypto.randomUUID() as FolderId;
      const siblings = [...folders.values()].filter(
        (f) => f.workspaceId === tab.workspaceId && f.parentFolderId === null,
      );
      const maxOrder = siblings.reduce((m, f) => Math.max(m, f.order), -1);

      const folder: Folder = {
        id: folderId,
        workspaceId: tab.workspaceId,
        name: "New Folder",
        parentFolderId: null,
        collapsed: false,
        order: maxOrder + 1,
      };

      folders.set(folderId, folder);
      persistFolder(folder);
      setTabFolderId(tabId, folderId);
      const updatedTab2 = getTab(tabId);
      if (updatedTab2) {
        events.emit(TABS_UPDATED, { tab: { ...updatedTab2 } });
      }
      events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(tab.workspaceId) });
      emitChanged();
      events.emit(FOLDERS_RENAME_REQUESTED, { folderId });
    }
  });

  commands.handle(FOLDERS_RENAME, async (payload) => {
    const folder = folders.get(payload.folderId);
    if (!folder) return;
    folder.name = payload.name;
    persistFolder(folder);
    emitChanged();
  });

  commands.handle(FOLDERS_TOGGLE_COLLAPSE, async (payload) => {
    const folder = folders.get(payload.folderId);
    if (!folder) return;
    folder.collapsed = !folder.collapsed;
    persistFolder(folder);
    emitChanged();
  });

  commands.handle(FOLDERS_REMOVE, async (payload) => {
    const folder = folders.get(payload.folderId);
    if (!folder) return;

    // Move contained tabs to parent folder (or root)
    const tabsInFolder = getTabsForWorkspace(folder.workspaceId).filter(
      (t) => t.folderId === folder.id,
    );
    for (const tab of tabsInFolder) {
      setTabFolderId(tab.id, folder.parentFolderId ?? null);
    }

    // Promote child folders to parent level
    for (const child of folders.values()) {
      if (child.parentFolderId === folder.id) {
        child.parentFolderId = folder.parentFolderId;
        persistFolder(child);
      }
    }

    folders.delete(folder.id);
    removePersistedFolder(folder.id);

    if (tabsInFolder.length > 0) {
      events.emit(TABS_LIST_CHANGED, { tabs: getTabsForWorkspace(folder.workspaceId) });
    }
    emitChanged();
  });

  commands.handle(FOLDERS_REORDER, async (payload) => {
    const folder = folders.get(payload.folderId);
    if (!folder) return;

    // Update parent if specified
    if (payload.parentFolderId !== undefined) {
      // Prevent circular nesting (can't nest a folder into itself or its descendants)
      if (payload.parentFolderId !== null) {
        let ancestor = folders.get(payload.parentFolderId);
        while (ancestor) {
          if (ancestor.id === folder.id) return; // circular
          ancestor = ancestor.parentFolderId ? folders.get(ancestor.parentFolderId) : undefined;
        }
      }
      folder.parentFolderId = payload.parentFolderId;
    }

    // Unified ordering: include both folders and tabs at the target level
    const folderSiblings = [...folders.values()]
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

    type Item = { type: "folder"; folder: Folder } | { type: "tab"; tab: (typeof tabSiblings)[0] };
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
    for (const [i, item] of items.entries()) {
      if (item.type === "folder") {
        item.folder.order = i;
        persistFolder(item.folder);
      } else if (item.tab.order !== i) {
        setTabOrder(item.tab.id, i);
      }
    }

    emitChanged();
  });

  commands.handle(FOLDERS_CREATE, async (payload) => {
    const workspaceId = (payload.workspaceId as WorkspaceId) ?? getActiveWorkspaceId();
    if (!workspaceId) return;

    const parentFolderId = (payload.parentFolderId as FolderId | null) ?? null;
    const siblings = [...folders.values()].filter(
      (f) => f.workspaceId === workspaceId && f.parentFolderId === parentFolderId,
    );
    const maxOrder = siblings.reduce((m, f) => Math.max(m, f.order), -1);

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
    persistFolder(folder);
    emitChanged();
    events.emit(FOLDERS_RENAME_REQUESTED, { folderId });
  });
}

export async function start(deps: Deps): Promise<void> {
  const { dataStore, events } = deps;
  const foldersCollection: Collection<PersistedFolder> = dataStore.collection("folders");

  if (!_folders) throw new Error("folders.main: register() must be called before start()");

  const persisted = await foldersCollection.findMany({});
  for (const pf of persisted) {
    const folder: Folder = {
      id: pf.id as FolderId,
      workspaceId: pf.workspaceId as WorkspaceId,
      name: pf.name,
      parentFolderId: pf.parentFolderId as FolderId | null,
      collapsed: pf.collapsed,
      order: pf.order,
    };
    _folders.set(folder.id, folder);
  }

  if (_folders.size > 0) {
    events.emit(FOLDERS_CHANGED, { folders: [..._folders.values()] });
  }
}

export function getFoldersForWorkspace(workspaceId: WorkspaceId): Folder[] {
  if (!_folders) return [];
  return [..._folders.values()].filter((f) => f.workspaceId === workspaceId);
}

export function getFoldersForLevel(
  workspaceId: WorkspaceId,
  parentFolderId: FolderId | null,
): Folder[] {
  if (!_folders) return [];
  return [..._folders.values()].filter(
    (f) => f.workspaceId === workspaceId && f.parentFolderId === parentFolderId,
  );
}

export function setFolderOrder(folderId: FolderId, order: number): void {
  if (!_folders || !_setFolderOrder) return;
  _setFolderOrder(folderId, order);
}
