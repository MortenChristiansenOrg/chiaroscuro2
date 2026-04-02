import type { SearchProvider } from "../command-palette/resolve-input";
import type { PdfBackendType } from "../pdf-reader/pdf-reader.shared";

// ── Command names ────────────────────────────────────────────────
export const SETTINGS_OPEN = "settings:open" as const;
export const SETTINGS_GET = "settings:get" as const;
export const SETTINGS_SAVE = "settings:save" as const;

// ── Event names ──────────────────────────────────────────────────
export const SETTINGS_CHANGED = "settings:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface DebugServerSettings {
  enabled: boolean;
  port: number;
}

export interface Settings {
  searchProviders: SearchProvider[];
  defaultSearchProviderId: string;
  debugServer: DebugServerSettings;
  pdfBackend: PdfBackendType;
}

// ── Payload types ────────────────────────────────────────────────
export interface SettingsChangedEvent {
  settings: Settings;
}

// ── Command registry ─────────────────────────────────────────────
export type SettingsCommands = {
  [SETTINGS_OPEN]: { payload: undefined; response: undefined };
  [SETTINGS_GET]: { payload: undefined; response: Settings };
  [SETTINGS_SAVE]: { payload: Settings; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type SettingsEvents = {
  [SETTINGS_CHANGED]: SettingsChangedEvent;
};
