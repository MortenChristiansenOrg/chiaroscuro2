import type { TabId } from "../../shared/types";

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
export type LocalWebAppStatus = "running" | "stopped" | "error";

export interface LocalWebAppConfig {
  directory: string;
  command: string;
}

// ── Command payloads ─────────────────────────────────────────────
export interface LocalWebAppSaveConfigPayload {
  tabId: TabId;
  directory: string;
  command: string;
}

export interface LocalWebAppTabPayload {
  tabId: TabId;
}

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
export type LocalWebAppCommands = {
  [LOCAL_WEB_APP_SAVE_CONFIG]: { payload: LocalWebAppSaveConfigPayload; response: undefined };
  [LOCAL_WEB_APP_DELETE_CONFIG]: { payload: LocalWebAppTabPayload; response: undefined };
  [LOCAL_WEB_APP_START]: { payload: LocalWebAppTabPayload; response: undefined };
  [LOCAL_WEB_APP_STOP]: { payload: LocalWebAppTabPayload; response: undefined };
  [LOCAL_WEB_APP_BROWSE_DIRECTORY]: { payload: undefined; response: string | undefined };
  [LOCAL_WEB_APP_GET_CONFIG]: {
    payload: LocalWebAppTabPayload;
    response: (LocalWebAppConfig & { status: LocalWebAppStatus }) | undefined;
  };
};

// ── Event registry ───────────────────────────────────────────────
export type LocalWebAppEvents = {
  [LOCAL_WEB_APP_STATUS_CHANGED]: LocalWebAppStatusChangedEvent;
  [LOCAL_WEB_APP_CONFIG_CHANGED]: LocalWebAppConfigChangedEvent;
  [LOCAL_WEB_APP_CONFIG_REMOVED]: LocalWebAppConfigRemovedEvent;
};
