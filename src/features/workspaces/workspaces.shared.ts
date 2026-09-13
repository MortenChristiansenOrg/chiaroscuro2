import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { WorkspaceId } from "../../shared/types";
import type {
  commandContracts,
  WorkspaceSchema,
  WorkspacesCreatePayloadSchema,
  WorkspacesDeletePayloadSchema,
  WorkspacesMoveTabPayloadSchema,
  WorkspacesSwitchPayloadSchema,
  WorkspacesUpdatePayloadSchema,
} from "./workspaces.contracts";

// ── Command names ────────────────────────────────────────────────
export const WORKSPACES_SWITCH = "workspaces:switch" as const;
export const WORKSPACES_CREATE = "workspaces:create" as const;
export const WORKSPACES_UPDATE = "workspaces:update" as const;
export const WORKSPACES_DELETE = "workspaces:delete" as const;
export const WORKSPACES_MOVE_TAB = "workspaces:move-tab" as const;
export const WORKSPACES_RESTORE_TAB = "workspaces:restore-tab" as const;

// ── Event names ──────────────────────────────────────────────────
export const WORKSPACES_SWITCHED = "workspaces:switched" as const;
export const WORKSPACES_CREATED = "workspaces:created" as const;
export const WORKSPACES_UPDATED = "workspaces:updated" as const;
export const WORKSPACES_DELETED = "workspaces:deleted" as const;
export const WORKSPACES_LIST_CHANGED = "workspaces:list-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Shape persisted to DataStore. */
export interface PersistedWorkspace {
  id: string;
  name: string;
  color: string;
  icon: string;
  privacyMode?: boolean;
  order: number;
}

// ── Payload types ────────────────────────────────────────────────
export type WorkspacesSwitchPayload = z.infer<typeof WorkspacesSwitchPayloadSchema>;

export type WorkspacesCreatePayload = z.infer<typeof WorkspacesCreatePayloadSchema>;

export type WorkspacesUpdatePayload = z.infer<typeof WorkspacesUpdatePayloadSchema>;

export type WorkspacesDeletePayload = z.infer<typeof WorkspacesDeletePayloadSchema>;

export type WorkspacesMoveTabPayload = z.infer<typeof WorkspacesMoveTabPayloadSchema>;

export interface WorkspacesSwitchedEvent {
  workspaceId: WorkspaceId;
  previousWorkspaceId: WorkspaceId | null;
  workspaceName: string;
}

export interface WorkspacesCreatedEvent {
  workspace: Workspace;
}

export interface WorkspacesUpdatedEvent {
  workspace: Workspace;
}

export interface WorkspacesDeletedEvent {
  workspaceId: WorkspaceId;
}

export interface WorkspacesListChangedEvent {
  workspaces: Workspace[];
}

// ── Command registry ─────────────────────────────────────────────
export type WorkspacesCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type WorkspacesEvents = {
  [WORKSPACES_SWITCHED]: WorkspacesSwitchedEvent;
  [WORKSPACES_CREATED]: WorkspacesCreatedEvent;
  [WORKSPACES_UPDATED]: WorkspacesUpdatedEvent;
  [WORKSPACES_DELETED]: WorkspacesDeletedEvent;
  [WORKSPACES_LIST_CHANGED]: WorkspacesListChangedEvent;
};
