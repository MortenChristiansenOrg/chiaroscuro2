import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  CommandPaletteExecutePayloadSchema,
  CommandPaletteSearchVisitsPayloadSchema,
  commandContracts,
  SuggestionSchema,
} from "./command-palette.contracts";
// ── Command names ────────────────────────────────────────────────
export const COMMAND_PALETTE_SHOW = "command-palette:show" as const;
export const COMMAND_PALETTE_HIDE = "command-palette:hide" as const;
export const COMMAND_PALETTE_TOGGLE = "command-palette:toggle" as const;
export const COMMAND_PALETTE_EXECUTE = "command-palette:execute" as const;
export const COMMAND_PALETTE_SEARCH_VISITS = "command-palette:search-visits" as const;

// ── Event names ──────────────────────────────────────────────────
export const COMMAND_PALETTE_SHOWN = "command-palette:shown" as const;
export const COMMAND_PALETTE_HIDDEN = "command-palette:hidden" as const;
export const COMMAND_PALETTE_SUGGESTIONS = "command-palette:suggestions" as const;

// ── Payload types ────────────────────────────────────────────────
export type CommandPaletteExecutePayload = z.infer<typeof CommandPaletteExecutePayloadSchema>;

export type CommandPaletteSearchVisitsPayload = z.infer<
  typeof CommandPaletteSearchVisitsPayloadSchema
>;

export type Suggestion = z.infer<typeof SuggestionSchema>;

export interface CommandPaletteSuggestionsEvent {
  suggestions: Suggestion[];
}

// ── Command registry ─────────────────────────────────────────────
export type CommandPaletteCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type CommandPaletteEvents = {
  [COMMAND_PALETTE_SHOWN]: undefined;
  [COMMAND_PALETTE_HIDDEN]: undefined;
  [COMMAND_PALETTE_SUGGESTIONS]: CommandPaletteSuggestionsEvent;
};
