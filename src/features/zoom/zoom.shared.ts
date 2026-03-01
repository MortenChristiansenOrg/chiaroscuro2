import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const ZOOM_IN = "zoom:in" as const;
export const ZOOM_OUT = "zoom:out" as const;
export const ZOOM_RESET = "zoom:reset" as const;

// ── Event names ──────────────────────────────────────────────────
export const ZOOM_CHANGED = "zoom:changed" as const;

// ── Constants ────────────────────────────────────────────────────
export const ZOOM_MIN = -3;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 1;
export const ZOOM_DEFAULT = 0;

// ── Payload types ────────────────────────────────────────────────
export interface ZoomChangedEvent {
  tabId: TabId;
  zoomLevel: number;
}

// ── Command registry ─────────────────────────────────────────────
export type ZoomCommands = {
  [ZOOM_IN]: { payload: undefined; response: undefined };
  [ZOOM_OUT]: { payload: undefined; response: undefined };
  [ZOOM_RESET]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type ZoomEvents = {
  [ZOOM_CHANGED]: ZoomChangedEvent;
};
