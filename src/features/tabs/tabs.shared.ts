import type { Bounds, TabId, WorkspaceId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const TABS_CREATE = "tabs:create" as const;
export const TABS_CLOSE = "tabs:close" as const;
export const TABS_ACTIVATE = "tabs:activate" as const;
export const TABS_NAVIGATE = "tabs:navigate" as const;
export const TABS_TOGGLE_BOOKMARK = "tabs:toggle-bookmark" as const;
export const TABS_CLEAR_EPHEMERAL = "tabs:clear-ephemeral" as const;
export const TABS_REORDER = "tabs:reorder" as const;
export const TABS_REPORT_CONTENT_BOUNDS = "tabs:report-content-bounds" as const;

// ── Event names ──────────────────────────────────────────────────
export const TABS_CREATED = "tabs:created" as const;
export const TABS_CLOSED = "tabs:closed" as const;
export const TABS_ACTIVATED = "tabs:activated" as const;
export const TABS_UPDATED = "tabs:updated" as const;
export const TABS_LIST_CHANGED = "tabs:list-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface Tab {
  id: TabId;
  workspaceId: WorkspaceId;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
  bookmarked: boolean;
  lastAccessedAt: number;
  createdAt: number;
  order: number;
}

/** Shape persisted to DataStore (no transient fields like loading). */
export interface PersistedTab {
  id: string;
  workspaceId: string;
  url: string;
  title: string;
  favicon: string;
  bookmarked: boolean;
  lastAccessedAt: number;
  createdAt: number;
  order: number;
}

// ── Payload types ────────────────────────────────────────────────
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
  url: string;
  tabId?: TabId;
}

export interface TabsToggleBookmarkPayload {
  tabId?: TabId;
}

export interface TabsClearEphemeralPayload {
  workspaceId?: WorkspaceId;
}

export interface TabsReorderPayload {
  tabId: TabId;
  targetIndex: number;
  targetBookmarked: boolean;
}

export interface TabsCreatedEvent {
  tab: Tab;
}

export interface TabsClosedEvent {
  tabId: TabId;
  activatedTabId: TabId | null;
}

export interface TabsActivatedEvent {
  tabId: TabId | null;
  previousTabId: TabId | null;
}

export interface TabsUpdatedEvent {
  tab: Tab;
}

export interface TabsListChangedEvent {
  tabs: Tab[];
}

// ── Command registry ─────────────────────────────────────────────
export type TabsCommands = {
  [TABS_CREATE]: { payload: TabsCreatePayload; response: TabId };
  [TABS_CLOSE]: { payload: TabsClosePayload; response: undefined };
  [TABS_ACTIVATE]: { payload: TabsActivatePayload; response: undefined };
  [TABS_NAVIGATE]: { payload: TabsNavigatePayload; response: undefined };
  [TABS_TOGGLE_BOOKMARK]: { payload: TabsToggleBookmarkPayload; response: undefined };
  [TABS_CLEAR_EPHEMERAL]: { payload: TabsClearEphemeralPayload; response: undefined };
  [TABS_REORDER]: { payload: TabsReorderPayload; response: undefined };
  [TABS_REPORT_CONTENT_BOUNDS]: { payload: Bounds; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type TabsEvents = {
  [TABS_CREATED]: TabsCreatedEvent;
  [TABS_CLOSED]: TabsClosedEvent;
  [TABS_ACTIVATED]: TabsActivatedEvent;
  [TABS_UPDATED]: TabsUpdatedEvent;
  [TABS_LIST_CHANGED]: TabsListChangedEvent;
};
