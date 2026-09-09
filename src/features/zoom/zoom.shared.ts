import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type { commandContracts } from "./zoom.contracts";

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
export type ZoomCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type ZoomEvents = {
  [ZOOM_CHANGED]: ZoomChangedEvent;
};
