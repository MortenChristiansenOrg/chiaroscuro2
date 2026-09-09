import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  CopyImagePayloadSchema,
  CopyTextPayloadSchema,
  commandContracts,
  DownloadImagePayloadSchema,
  SearchTextPayloadSchema,
} from "./tab-context-menu.contracts";

// ── Command names ────────────────────────────────────────────────
export const TAB_CONTEXT_MENU_COPY_TEXT = "tab-context-menu:copy-text" as const;
export const TAB_CONTEXT_MENU_COPY_IMAGE = "tab-context-menu:copy-image" as const;
export const TAB_CONTEXT_MENU_DOWNLOAD_IMAGE = "tab-context-menu:download-image" as const;
export const TAB_CONTEXT_MENU_SEARCH_TEXT = "tab-context-menu:search-text" as const;

// ── Payload types ────────────────────────────────────────────────
export type CopyTextPayload = z.infer<typeof CopyTextPayloadSchema>;

export type CopyImagePayload = z.infer<typeof CopyImagePayloadSchema>;

export type DownloadImagePayload = z.infer<typeof DownloadImagePayloadSchema>;

export type SearchTextPayload = z.infer<typeof SearchTextPayloadSchema>;

// ── Command registry ─────────────────────────────────────────────
export type TabContextMenuCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type TabContextMenuEvents = Record<string, never>;
