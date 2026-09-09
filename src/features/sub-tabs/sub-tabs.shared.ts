import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type {
  commandContracts,
  SubTabSchema,
  SubTabsCloseAllPayloadSchema,
  SubTabsClosePayloadSchema,
  SubTabsGetStackPayloadSchema,
  SubTabsOpenPayloadSchema,
  SubTabsPromotePayloadSchema,
} from "./sub-tabs.contracts";

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
export type SubTab = z.infer<typeof SubTabSchema>;

// ── Payload types ────────────────────────────────────────────────
export type SubTabsOpenPayload = z.infer<typeof SubTabsOpenPayloadSchema>;

export type SubTabsClosePayload = z.infer<typeof SubTabsClosePayloadSchema>;

export type SubTabsCloseAllPayload = z.infer<typeof SubTabsCloseAllPayloadSchema>;

export type SubTabsPromotePayload = z.infer<typeof SubTabsPromotePayloadSchema>;

export type SubTabsGetStackPayload = z.infer<typeof SubTabsGetStackPayloadSchema>;

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
export type SubTabsCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type SubTabsEvents = {
  [SUB_TABS_OPENED]: SubTabsOpenedEvent;
  [SUB_TABS_CLOSED]: SubTabsClosedEvent;
  [SUB_TABS_PROMOTED]: SubTabsPromotedEvent;
  [SUB_TABS_STACK_CHANGED]: SubTabsStackChangedEvent;
  [SUB_TABS_UPDATED]: SubTabsUpdatedEvent;
};
