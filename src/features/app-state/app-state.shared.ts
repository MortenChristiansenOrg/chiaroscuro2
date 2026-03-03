import type { Bounds } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const APP_STATE_SAVE = "app-state:save" as const;
export const APP_STATE_SET_SIDEBAR_WIDTH = "app-state:set-sidebar-width" as const;

// ── Event names ──────────────────────────────────────────────────
export const APP_STATE_RESTORED = "app-state:restored" as const;
export const APP_STATE_SIDEBAR_WIDTH_CHANGED = "app-state:sidebar-width-changed" as const;

// ── Payload types ────────────────────────────────────────────────
export interface AppStateRestoredEvent {
  sidebarWidth: number;
  windowBounds: Bounds;
}

export interface AppStateSidebarWidthChangedEvent {
  width: number;
}

export interface SetSidebarWidthPayload {
  width: number;
}

// ── Persisted shape ──────────────────────────────────────────────
export interface PersistedAppState {
  sidebarWidth: number;
  windowBounds: Bounds;
}

// ── Defaults ─────────────────────────────────────────────────────
export const DEFAULT_SIDEBAR_WIDTH = 240; // px (matches --sidebar-width: 15rem)
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 480;
export const DEFAULT_WINDOW_BOUNDS: Bounds = { x: 100, y: 100, width: 1200, height: 800 };

// ── Command registry ─────────────────────────────────────────────
export type AppStateCommands = {
  [APP_STATE_SAVE]: { payload: undefined; response: undefined };
  [APP_STATE_SET_SIDEBAR_WIDTH]: { payload: SetSidebarWidthPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type AppStateEvents = {
  [APP_STATE_RESTORED]: AppStateRestoredEvent;
  [APP_STATE_SIDEBAR_WIDTH_CHANGED]: AppStateSidebarWidthChangedEvent;
};
