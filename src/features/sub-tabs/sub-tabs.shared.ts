import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const SUB_TABS_OPEN = "sub-tabs:open" as const;
export const SUB_TABS_CLOSE = "sub-tabs:close" as const;
export const SUB_TABS_CLOSE_ALL = "sub-tabs:close-all" as const;
export const SUB_TABS_PROMOTE = "sub-tabs:promote" as const;
export const SUB_TABS_GET_STACK = "sub-tabs:get-stack" as const;

// ── Event names ──────────────────────────────────────────────────
export const SUB_TABS_OPENED = "sub-tabs:opened" as const;
export const SUB_TABS_CLOSED = "sub-tabs:closed" as const;
export const SUB_TABS_PROMOTED = "sub-tabs:promoted" as const;
export const SUB_TABS_STACK_CHANGED = "sub-tabs:stack-changed" as const;
export const SUB_TABS_UPDATED = "sub-tabs:updated" as const;

// ── Data types ───────────────────────────────────────────────────
export interface SubTab {
  id: TabId;
  parentTabId: TabId;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
}

// ── Payload types ────────────────────────────────────────────────
export interface SubTabsOpenPayload {
  parentTabId: TabId;
  url: string;
}

export interface SubTabsClosePayload {
  parentTabId: TabId;
}

export interface SubTabsCloseAllPayload {
  parentTabId: TabId;
}

export interface SubTabsPromotePayload {
  parentTabId: TabId;
}

export interface SubTabsGetStackPayload {
  parentTabId: TabId;
}

// ── Event payloads ───────────────────────────────────────────────
export interface SubTabsOpenedEvent {
  parentTabId: TabId;
  subTab: SubTab;
}

export interface SubTabsClosedEvent {
  parentTabId: TabId;
  subTabId: TabId;
}

export interface SubTabsPromotedEvent {
  parentTabId: TabId;
  subTabId: TabId;
  newTabId: TabId;
}

export interface SubTabsStackChangedEvent {
  parentTabId: TabId;
  stack: SubTab[];
}

export interface SubTabsUpdatedEvent {
  parentTabId: TabId;
  subTab: SubTab;
}

// ── Command registry ─────────────────────────────────────────────
export type SubTabsCommands = {
  [SUB_TABS_OPEN]: { payload: SubTabsOpenPayload; response: TabId };
  [SUB_TABS_CLOSE]: { payload: SubTabsClosePayload; response: undefined };
  [SUB_TABS_CLOSE_ALL]: { payload: SubTabsCloseAllPayload; response: undefined };
  [SUB_TABS_PROMOTE]: { payload: SubTabsPromotePayload; response: TabId };
  [SUB_TABS_GET_STACK]: { payload: SubTabsGetStackPayload; response: SubTab[] };
};

// ── Event registry ───────────────────────────────────────────────
export type SubTabsEvents = {
  [SUB_TABS_OPENED]: SubTabsOpenedEvent;
  [SUB_TABS_CLOSED]: SubTabsClosedEvent;
  [SUB_TABS_PROMOTED]: SubTabsPromotedEvent;
  [SUB_TABS_STACK_CHANGED]: SubTabsStackChangedEvent;
  [SUB_TABS_UPDATED]: SubTabsUpdatedEvent;
};
