import type { TabId, WorkspaceId } from "../../shared/types";

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
export interface Workspace {
  id: WorkspaceId;
  name: string;
  color: string;
  icon: string;
  privacyMode: boolean;
  activeTabId: TabId | null;
}

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
export interface WorkspacesSwitchPayload {
  workspaceId: WorkspaceId;
}

export interface WorkspacesCreatePayload {
  name: string;
  color: string;
  icon: string;
  privacyMode: boolean;
}

export interface WorkspacesUpdatePayload {
  workspaceId: WorkspaceId;
  changes: Partial<Pick<Workspace, "name" | "color" | "icon" | "privacyMode">>;
}

export interface WorkspacesDeletePayload {
  workspaceId: WorkspaceId;
}

export interface WorkspacesMoveTabPayload {
  targetWorkspaceId: WorkspaceId;
}

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
export type WorkspacesCommands = {
  [WORKSPACES_SWITCH]: { payload: WorkspacesSwitchPayload; response: undefined };
  [WORKSPACES_CREATE]: { payload: WorkspacesCreatePayload; response: WorkspaceId };
  [WORKSPACES_UPDATE]: { payload: WorkspacesUpdatePayload; response: undefined };
  [WORKSPACES_DELETE]: { payload: WorkspacesDeletePayload; response: undefined };
  [WORKSPACES_MOVE_TAB]: { payload: WorkspacesMoveTabPayload; response: undefined };
  [WORKSPACES_RESTORE_TAB]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type WorkspacesEvents = {
  [WORKSPACES_SWITCHED]: WorkspacesSwitchedEvent;
  [WORKSPACES_CREATED]: WorkspacesCreatedEvent;
  [WORKSPACES_UPDATED]: WorkspacesUpdatedEvent;
  [WORKSPACES_DELETED]: WorkspacesDeletedEvent;
  [WORKSPACES_LIST_CHANGED]: WorkspacesListChangedEvent;
};
