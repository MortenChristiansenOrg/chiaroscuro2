import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { FolderId } from "../../shared/types";
import type {
  commandContracts,
  FolderSchema,
  FoldersCreatePayloadSchema,
  FoldersRemovePayloadSchema,
  FoldersRenamePayloadSchema,
  FoldersReorderPayloadSchema,
  FoldersToggleCollapsePayloadSchema,
  FoldersTogglePayloadSchema,
} from "./folders.contracts";

// ── Command names ────────────────────────────────────────────────
export const FOLDERS_TOGGLE = "folders:toggle" as const;
export const FOLDERS_RENAME = "folders:rename" as const;
export const FOLDERS_TOGGLE_COLLAPSE = "folders:toggle-collapse" as const;
export const FOLDERS_REMOVE = "folders:remove" as const;
export const FOLDERS_REORDER = "folders:reorder" as const;
export const FOLDERS_CREATE = "folders:create" as const;
export const FOLDERS_GET_FOR_LEVEL = "folders:get-for-level" as const;
export const FOLDERS_SET_ORDER = "folders:set-order" as const;

// ── Event names ──────────────────────────────────────────────────
export const FOLDERS_CHANGED = "folders:changed" as const;
export const FOLDERS_RENAME_REQUESTED = "folders:rename-requested" as const;

// ── Data types ───────────────────────────────────────────────────
export type Folder = z.infer<typeof FolderSchema>;

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
export type FoldersTogglePayload = z.infer<typeof FoldersTogglePayloadSchema>;

export type FoldersRenamePayload = z.infer<typeof FoldersRenamePayloadSchema>;

export type FoldersToggleCollapsePayload = z.infer<typeof FoldersToggleCollapsePayloadSchema>;

export type FoldersRemovePayload = z.infer<typeof FoldersRemovePayloadSchema>;

export type FoldersReorderPayload = z.infer<typeof FoldersReorderPayloadSchema>;

export type FoldersCreatePayload = z.infer<typeof FoldersCreatePayloadSchema>;

export interface FoldersChangedEvent {
  folders: Folder[];
}

export interface FoldersRenameRequestedEvent {
  folderId: FolderId;
}

// ── Command registry ─────────────────────────────────────────────
export type FoldersCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type FoldersEvents = {
  [FOLDERS_CHANGED]: FoldersChangedEvent;
  [FOLDERS_RENAME_REQUESTED]: FoldersRenameRequestedEvent;
};
