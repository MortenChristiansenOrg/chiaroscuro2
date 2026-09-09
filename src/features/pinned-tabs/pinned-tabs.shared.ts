import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type {
  commandContracts,
  PinnedTabsActivatePayloadSchema,
  PinnedTabsTogglePinPayloadSchema,
} from "./pinned-tabs.contracts";

// ── Command names ────────────────────────────────────────────────
export const PINNED_TABS_TOGGLE_PIN = "pinned-tabs:toggle-pin" as const;
export const PINNED_TABS_ACTIVATE = "pinned-tabs:activate" as const;
export const PINNED_TABS_IS_PINNED = "pinned-tabs:is-pinned" as const;

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
export type PinnedTabsTogglePinPayload = z.infer<typeof PinnedTabsTogglePinPayloadSchema>;

export type PinnedTabsActivatePayload = z.infer<typeof PinnedTabsActivatePayloadSchema>;

export interface PinnedTabsChangedEvent {
  pinnedTabs: PinnedTab[];
}

export interface PinnedTabsActiveChangedEvent {
  tabId: TabId | null;
}

// ── Command registry ─────────────────────────────────────────────
export type PinnedTabsCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type PinnedTabsEvents = {
  [PINNED_TABS_CHANGED]: PinnedTabsChangedEvent;
  [PINNED_TABS_ACTIVE_CHANGED]: PinnedTabsActiveChangedEvent;
};
