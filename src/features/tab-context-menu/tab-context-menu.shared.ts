import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const TAB_CONTEXT_MENU_COPY_TEXT = "tab-context-menu:copy-text" as const;
export const TAB_CONTEXT_MENU_COPY_IMAGE = "tab-context-menu:copy-image" as const;
export const TAB_CONTEXT_MENU_DOWNLOAD_IMAGE = "tab-context-menu:download-image" as const;
export const TAB_CONTEXT_MENU_SEARCH_TEXT = "tab-context-menu:search-text" as const;

// ── Payload types ────────────────────────────────────────────────
export interface CopyTextPayload {
  text: string;
}

export interface CopyImagePayload {
  tabId: TabId;
  x: number;
  y: number;
}

export interface DownloadImagePayload {
  url: string;
  tabId: TabId;
}

export interface SearchTextPayload {
  text: string;
}

// ── Command registry ─────────────────────────────────────────────
export type TabContextMenuCommands = {
  [TAB_CONTEXT_MENU_COPY_TEXT]: { payload: CopyTextPayload; response: undefined };
  [TAB_CONTEXT_MENU_COPY_IMAGE]: { payload: CopyImagePayload; response: undefined };
  [TAB_CONTEXT_MENU_DOWNLOAD_IMAGE]: { payload: DownloadImagePayload; response: undefined };
  [TAB_CONTEXT_MENU_SEARCH_TEXT]: { payload: SearchTextPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type TabContextMenuEvents = Record<string, never>;
