import type { Bounds, TabId, WorkspaceId } from "../../shared/types";
export declare const TABS_CREATE: "tabs:create";
export declare const TABS_CLOSE: "tabs:close";
export declare const TABS_ACTIVATE: "tabs:activate";
export declare const TABS_NAVIGATE: "tabs:navigate";
export declare const TABS_TOGGLE_BOOKMARK: "tabs:toggle-bookmark";
export declare const TABS_CLEAR_EPHEMERAL: "tabs:clear-ephemeral";
export declare const TABS_REPORT_CONTENT_BOUNDS: "tabs:report-content-bounds";
export declare const TABS_CREATED: "tabs:created";
export declare const TABS_CLOSED: "tabs:closed";
export declare const TABS_ACTIVATED: "tabs:activated";
export declare const TABS_UPDATED: "tabs:updated";
export declare const TABS_LIST_CHANGED: "tabs:list-changed";
export interface Tab {
  id: TabId;
  workspaceId: WorkspaceId;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
  bookmarked: boolean;
  lastAccessedAt: number;
  order: number;
}
export interface TabsCreatePayload {
  url: string;
  workspaceId?: WorkspaceId;
  activate?: boolean;
}
export interface TabsClosePayload {
  tabId: TabId;
}
export interface TabsActivatePayload {
  tabId: TabId;
}
export interface TabsNavigatePayload {
  tabId: TabId;
  url: string;
}
export interface TabsToggleBookmarkPayload {
  tabId: TabId;
}
export interface TabsClearEphemeralPayload {
  workspaceId: WorkspaceId;
}
export interface TabsCreatedEvent {
  tab: Tab;
}
export interface TabsClosedEvent {
  tabId: TabId;
  activatedTabId: TabId | null;
}
export interface TabsActivatedEvent {
  tabId: TabId;
  previousTabId: TabId | null;
}
export interface TabsUpdatedEvent {
  tab: Tab;
}
export interface TabsListChangedEvent {
  tabs: Tab[];
}
export type TabsCommands = {
  [TABS_CREATE]: {
    payload: TabsCreatePayload;
    response: TabId;
  };
  [TABS_CLOSE]: {
    payload: TabsClosePayload;
    response: undefined;
  };
  [TABS_ACTIVATE]: {
    payload: TabsActivatePayload;
    response: undefined;
  };
  [TABS_NAVIGATE]: {
    payload: TabsNavigatePayload;
    response: undefined;
  };
  [TABS_TOGGLE_BOOKMARK]: {
    payload: TabsToggleBookmarkPayload;
    response: undefined;
  };
  [TABS_CLEAR_EPHEMERAL]: {
    payload: TabsClearEphemeralPayload;
    response: undefined;
  };
  [TABS_REPORT_CONTENT_BOUNDS]: {
    payload: Bounds;
    response: undefined;
  };
};
export type TabsEvents = {
  [TABS_CREATED]: TabsCreatedEvent;
  [TABS_CLOSED]: TabsClosedEvent;
  [TABS_ACTIVATED]: TabsActivatedEvent;
  [TABS_UPDATED]: TabsUpdatedEvent;
  [TABS_LIST_CHANGED]: TabsListChangedEvent;
};
