import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  commandContracts,
  DebugServerSettingsSchema,
  SettingsSchema,
} from "./settings.contracts";

// ── Command names ────────────────────────────────────────────────
export const SETTINGS_OPEN = "settings:open" as const;
export const SETTINGS_GET = "settings:get" as const;
export const SETTINGS_SAVE = "settings:save" as const;

// ── Event names ──────────────────────────────────────────────────
export const SETTINGS_CHANGED = "settings:changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type DebugServerSettings = z.infer<typeof DebugServerSettingsSchema>;

export type Settings = z.infer<typeof SettingsSchema>;

// ── Payload types ────────────────────────────────────────────────
export interface SettingsChangedEvent {
  settings: Settings;
}

// ── Command registry ─────────────────────────────────────────────
export type SettingsCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type SettingsEvents = {
  [SETTINGS_CHANGED]: SettingsChangedEvent;
};
