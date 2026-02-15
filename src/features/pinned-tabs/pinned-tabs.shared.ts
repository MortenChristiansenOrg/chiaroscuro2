import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const PINNED_TABS_TOGGLE_PIN = "pinned-tabs:toggle-pin" as const;
export const PINNED_TABS_ACTIVATE = "pinned-tabs:activate" as const;

// ── Event names ──────────────────────────────────────────────────
export const PINNED_TABS_CHANGED = "pinned-tabs:changed" as const;
export const PINNED_TABS_ACTIVE_CHANGED = "pinned-tabs:active-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface PinnedTab {
  id: TabId;
  url: string;
  title: string;
  favicon: string;
  order: number;
}

/** Shape persisted to DataStore. */
export interface PersistedPinnedTab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  order: number;
}

// ── Payload types ────────────────────────────────────────────────
export interface PinnedTabsActivatePayload {
  tabId: TabId;
}

export interface PinnedTabsChangedEvent {
  pinnedTabs: PinnedTab[];
}

export interface PinnedTabsActiveChangedEvent {
  tabId: TabId | null;
}

// ── Command registry ─────────────────────────────────────────────
export type PinnedTabsCommands = {
  [PINNED_TABS_TOGGLE_PIN]: { payload: undefined; response: undefined };
  [PINNED_TABS_ACTIVATE]: { payload: PinnedTabsActivatePayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type PinnedTabsEvents = {
  [PINNED_TABS_CHANGED]: PinnedTabsChangedEvent;
  [PINNED_TABS_ACTIVE_CHANGED]: PinnedTabsActiveChangedEvent;
};
