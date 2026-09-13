import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type { commandContracts } from "./window-chrome.contracts";

// ── Command names ────────────────────────────────────────────────
export const WINDOW_MINIMIZE = "window:minimize" as const;
export const WINDOW_MAXIMIZE_RESTORE = "window:maximize-restore" as const;
export const WINDOW_CLOSE = "window:close" as const;
export const WINDOW_COPY_ADDRESS = "window:copy-address" as const;
export const WINDOW_GO_BACK = "window:go-back" as const;
export const WINDOW_GO_FORWARD = "window:go-forward" as const;
export const WINDOW_RELOAD = "window:reload" as const;

// ── Event names ──────────────────────────────────────────────────
export const WINDOW_MAXIMIZED_CHANGED = "window:maximized-changed" as const;
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
export type WindowChromeCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type WindowChromeEvents = {
  [WINDOW_MAXIMIZED_CHANGED]: MaximizedChangedPayload;
  [TAB_LOADING_CHANGED]: TabLoadingChangedPayload;
};
