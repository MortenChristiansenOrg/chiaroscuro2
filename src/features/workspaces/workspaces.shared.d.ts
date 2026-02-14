import type { TabId, WorkspaceId } from "../../shared/types";
export declare const WORKSPACES_SWITCH: "workspaces:switch";
export declare const WORKSPACES_CREATE: "workspaces:create";
export declare const WORKSPACES_SWITCHED: "workspaces:switched";
export declare const WORKSPACES_CREATED: "workspaces:created";
export declare const WORKSPACES_LIST_CHANGED: "workspaces:list-changed";
export interface Workspace {
  id: WorkspaceId;
  name: string;
  color: string;
  initial: string;
  activeTabId: TabId | null;
}
export interface WorkspacesSwitchPayload {
  workspaceId: WorkspaceId;
}
export interface WorkspacesCreatePayload {
  name: string;
  color: string;
  initial: string;
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
export type WorkspacesCommands = {
  [WORKSPACES_SWITCH]: {
    payload: WorkspacesSwitchPayload;
    response: undefined;
  };
  [WORKSPACES_CREATE]: {
    payload: WorkspacesCreatePayload;
    response: WorkspaceId;
  };
};
export type WorkspacesEvents = {
  [WORKSPACES_SWITCHED]: WorkspacesSwitchedEvent;
  [WORKSPACES_CREATED]: WorkspacesCreatedEvent;
  [WORKSPACES_LIST_CHANGED]: WorkspacesListChangedEvent;
};
