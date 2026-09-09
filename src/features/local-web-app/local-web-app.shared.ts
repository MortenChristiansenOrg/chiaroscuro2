import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type {
  commandContracts,
  LocalWebAppConfigSchema,
  LocalWebAppSaveConfigPayloadSchema,
  LocalWebAppStatusSchema,
  LocalWebAppTabPayloadSchema,
} from "./local-web-app.contracts";

// ── Command names ────────────────────────────────────────────────
export const LOCAL_WEB_APP_SAVE_CONFIG = "local-web-app:save-config" as const;
export const LOCAL_WEB_APP_DELETE_CONFIG = "local-web-app:delete-config" as const;
export const LOCAL_WEB_APP_START = "local-web-app:start" as const;
export const LOCAL_WEB_APP_STOP = "local-web-app:stop" as const;
export const LOCAL_WEB_APP_BROWSE_DIRECTORY = "local-web-app:browse-directory" as const;
export const LOCAL_WEB_APP_GET_CONFIG = "local-web-app:get-config" as const;

// ── Event names ──────────────────────────────────────────────────
export const LOCAL_WEB_APP_STATUS_CHANGED = "local-web-app:status-changed" as const;
export const LOCAL_WEB_APP_CONFIG_CHANGED = "local-web-app:config-changed" as const;
export const LOCAL_WEB_APP_CONFIG_REMOVED = "local-web-app:config-removed" as const;

// ── Data types ───────────────────────────────────────────────────
export type LocalWebAppStatus = z.infer<typeof LocalWebAppStatusSchema>;

export type LocalWebAppConfig = z.infer<typeof LocalWebAppConfigSchema>;

// ── Command payloads ─────────────────────────────────────────────
export type LocalWebAppSaveConfigPayload = z.infer<typeof LocalWebAppSaveConfigPayloadSchema>;

export type LocalWebAppTabPayload = z.infer<typeof LocalWebAppTabPayloadSchema>;

// ── Event payloads ───────────────────────────────────────────────
export interface LocalWebAppStatusChangedEvent {
  tabId: TabId;
  status: LocalWebAppStatus;
}

export interface LocalWebAppConfigChangedEvent {
  tabId: TabId;
  config: LocalWebAppConfig;
}

export interface LocalWebAppConfigRemovedEvent {
  tabId: TabId;
}

// ── Command registry ─────────────────────────────────────────────
export type LocalWebAppCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type LocalWebAppEvents = {
  [LOCAL_WEB_APP_STATUS_CHANGED]: LocalWebAppStatusChangedEvent;
  [LOCAL_WEB_APP_CONFIG_CHANGED]: LocalWebAppConfigChangedEvent;
  [LOCAL_WEB_APP_CONFIG_REMOVED]: LocalWebAppConfigRemovedEvent;
};
