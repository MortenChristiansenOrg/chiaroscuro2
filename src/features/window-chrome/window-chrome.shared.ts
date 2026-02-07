import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const WINDOW_MINIMIZE = "window:minimize" as const;
export const WINDOW_MAXIMIZE_RESTORE = "window:maximize-restore" as const;
export const WINDOW_CLOSE = "window:close" as const;
export const WINDOW_COPY_ADDRESS = "window:copy-address" as const;

// ── Event names ──────────────────────────────────────────────────
export const WINDOW_MAXIMIZED_CHANGED = "window:maximized-changed" as const;
// TODO: emitted by Tabs feature (not yet implemented) — store + UI already wired
export const TAB_LOADING_CHANGED = "tab:loading-changed" as const;

// ── Payload types ────────────────────────────────────────────────
export interface MaximizedChangedPayload {
  maximized: boolean;
}

export interface TabLoadingChangedPayload {
  tabId: TabId;
  loading: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type WindowChromeCommands = {
  [WINDOW_MINIMIZE]: { payload: undefined; response: undefined };
  [WINDOW_MAXIMIZE_RESTORE]: { payload: undefined; response: undefined };
  [WINDOW_CLOSE]: { payload: undefined; response: undefined };
  [WINDOW_COPY_ADDRESS]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type WindowChromeEvents = {
  [WINDOW_MAXIMIZED_CHANGED]: MaximizedChangedPayload;
  [TAB_LOADING_CHANGED]: TabLoadingChangedPayload;
};
