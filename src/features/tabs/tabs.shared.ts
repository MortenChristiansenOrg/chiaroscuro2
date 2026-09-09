import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { Bounds, TabId } from "../../shared/types";
import type {
  commandContracts,
  TabSchema,
  TabsActivatePayloadSchema,
  TabsAdoptPayloadSchema,
  TabsClearEphemeralPayloadSchema,
  TabsClosePayloadSchema,
  TabsCreatePayloadSchema,
  TabsNavigatePayloadSchema,
  TabsReorderPayloadSchema,
  TabsToggleBookmarkPayloadSchema,
} from "./tabs.contracts";

// ── Command names ────────────────────────────────────────────────
export const TABS_CREATE = "tabs:create" as const;
export const TABS_CLOSE = "tabs:close" as const;
export const TABS_ACTIVATE = "tabs:activate" as const;
export const TABS_NAVIGATE = "tabs:navigate" as const;
export const TABS_TOGGLE_BOOKMARK = "tabs:toggle-bookmark" as const;
export const TABS_CLEAR_EPHEMERAL = "tabs:clear-ephemeral" as const;
export const TABS_REORDER = "tabs:reorder" as const;
export const TABS_REPORT_CONTENT_BOUNDS = "tabs:report-content-bounds" as const;
export const TABS_GET = "tabs:get" as const;
export const TABS_GET_FOR_WORKSPACE = "tabs:get-for-workspace" as const;
export const TABS_SET_FOLDER_ID = "tabs:set-folder-id" as const;
export const TABS_SET_ORDER = "tabs:set-order" as const;
export const TABS_SET_WORKSPACE = "tabs:set-workspace" as const;
export const TABS_ADOPT = "tabs:adopt" as const;

// ── Event names ──────────────────────────────────────────────────
export const TABS_CREATED = "tabs:created" as const;
export const TABS_CLOSED = "tabs:closed" as const;
export const TABS_ACTIVATED = "tabs:activated" as const;
export const TABS_UPDATED = "tabs:updated" as const;
export const TABS_LIST_CHANGED = "tabs:list-changed" as const;
export const TABS_CONTENT_BOUNDS_CHANGED = "tabs:content-bounds-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type Tab = z.infer<typeof TabSchema>;

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
  folderId: string | null;
}

// ── Payload types ────────────────────────────────────────────────
export type TabsCreatePayload = z.infer<typeof TabsCreatePayloadSchema>;

export type TabsClosePayload = z.infer<typeof TabsClosePayloadSchema>;

export type TabsActivatePayload = z.infer<typeof TabsActivatePayloadSchema>;

export type TabsNavigatePayload = z.infer<typeof TabsNavigatePayloadSchema>;

export type TabsToggleBookmarkPayload = z.infer<typeof TabsToggleBookmarkPayloadSchema>;

export type TabsClearEphemeralPayload = z.infer<typeof TabsClearEphemeralPayloadSchema>;

export type TabsAdoptPayload = z.infer<typeof TabsAdoptPayloadSchema>;

export type TabsReorderPayload = z.infer<typeof TabsReorderPayloadSchema>;

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
export type TabsCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type TabsEvents = {
  [TABS_CREATED]: TabsCreatedEvent;
  [TABS_CLOSED]: TabsClosedEvent;
  [TABS_ACTIVATED]: TabsActivatedEvent;
  [TABS_UPDATED]: TabsUpdatedEvent;
  [TABS_LIST_CHANGED]: TabsListChangedEvent;
  [TABS_CONTENT_BOUNDS_CHANGED]: Bounds;
};
