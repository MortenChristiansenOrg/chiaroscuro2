import type { TabId, WorkspaceId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const WORKSPACES_SWITCH = "workspaces:switch" as const;
export const WORKSPACES_CREATE = "workspaces:create" as const;

// ── Event names ──────────────────────────────────────────────────
export const WORKSPACES_SWITCHED = "workspaces:switched" as const;
export const WORKSPACES_CREATED = "workspaces:created" as const;
export const WORKSPACES_LIST_CHANGED = "workspaces:list-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface Workspace {
  id: WorkspaceId;
  name: string;
  color: string;
  icon: string;
  /** @deprecated Use `icon` instead */
  initial?: string;
  activeTabId: TabId | null;
}

// ── Payload types ────────────────────────────────────────────────
export interface WorkspacesSwitchPayload {
  workspaceId: WorkspaceId;
}

export interface WorkspacesCreatePayload {
  name: string;
  color: string;
  icon: string;
}

export interface WorkspacesSwitchedEvent {
  workspaceId: WorkspaceId;
  previousWorkspaceId: WorkspaceId | null;
}

export interface WorkspacesCreatedEvent {
  workspace: Workspace;
}

export interface WorkspacesListChangedEvent {
  workspaces: Workspace[];
}

// ── Command registry ─────────────────────────────────────────────
export type WorkspacesCommands = {
  [WORKSPACES_SWITCH]: { payload: WorkspacesSwitchPayload; response: undefined };
  [WORKSPACES_CREATE]: { payload: WorkspacesCreatePayload; response: WorkspaceId };
};

// ── Event registry ───────────────────────────────────────────────
export type WorkspacesEvents = {
  [WORKSPACES_SWITCHED]: WorkspacesSwitchedEvent;
  [WORKSPACES_CREATED]: WorkspacesCreatedEvent;
  [WORKSPACES_LIST_CHANGED]: WorkspacesListChangedEvent;
};
