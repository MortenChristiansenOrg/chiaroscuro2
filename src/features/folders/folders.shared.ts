import type { FolderId, WorkspaceId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const FOLDERS_TOGGLE = "folders:toggle" as const;
export const FOLDERS_RENAME = "folders:rename" as const;
export const FOLDERS_TOGGLE_COLLAPSE = "folders:toggle-collapse" as const;
export const FOLDERS_REMOVE = "folders:remove" as const;
export const FOLDERS_REORDER = "folders:reorder" as const;
export const FOLDERS_CREATE = "folders:create" as const;

// ── Event names ──────────────────────────────────────────────────
export const FOLDERS_CHANGED = "folders:changed" as const;
export const FOLDERS_RENAME_REQUESTED = "folders:rename-requested" as const;

// ── Data types ───────────────────────────────────────────────────
export interface Folder {
  id: FolderId;
  workspaceId: WorkspaceId;
  name: string;
  parentFolderId: FolderId | null;
  collapsed: boolean;
  order: number;
}

/** Shape persisted to DataStore. */
export interface PersistedFolder {
  id: string;
  workspaceId: string;
  name: string;
  parentFolderId: string | null;
  collapsed: boolean;
  order: number;
}

// ── Payload types ────────────────────────────────────────────────
export interface FoldersTogglePayload {
  /** Tab to toggle folder membership for. Uses active tab if omitted. */
  tabId?: string;
}

export interface FoldersRenamePayload {
  folderId: FolderId;
  name: string;
}

export interface FoldersToggleCollapsePayload {
  folderId: FolderId;
}

export interface FoldersRemovePayload {
  folderId: FolderId;
}

export interface FoldersReorderPayload {
  folderId: FolderId;
  /** Target folder to insert relative to (sibling). Omit to append. */
  targetFolderId?: FolderId;
  /** Target tab to insert relative to. Used when dragging folders over tabs. */
  targetTabId?: string;
  /** Position relative to target. Defaults to "before". */
  position?: "before" | "after";
  /** Parent folder to nest into. null = root level. */
  parentFolderId?: FolderId | null;
}

export interface FoldersCreatePayload {
  /** Parent folder to create inside. null = root level. */
  parentFolderId?: FolderId | null;
  /** Workspace to create in. Uses active workspace if omitted. */
  workspaceId?: WorkspaceId;
}

export interface FoldersChangedEvent {
  folders: Folder[];
}

export interface FoldersRenameRequestedEvent {
  folderId: FolderId;
}

// ── Command registry ─────────────────────────────────────────────
export type FoldersCommands = {
  [FOLDERS_TOGGLE]: { payload: FoldersTogglePayload; response: undefined };
  [FOLDERS_RENAME]: { payload: FoldersRenamePayload; response: undefined };
  [FOLDERS_TOGGLE_COLLAPSE]: { payload: FoldersToggleCollapsePayload; response: undefined };
  [FOLDERS_REMOVE]: { payload: FoldersRemovePayload; response: undefined };
  [FOLDERS_REORDER]: { payload: FoldersReorderPayload; response: undefined };
  [FOLDERS_CREATE]: { payload: FoldersCreatePayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type FoldersEvents = {
  [FOLDERS_CHANGED]: FoldersChangedEvent;
  [FOLDERS_RENAME_REQUESTED]: FoldersRenameRequestedEvent;
};
