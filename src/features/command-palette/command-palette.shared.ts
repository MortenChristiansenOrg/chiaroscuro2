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
export interface CommandPaletteExecutePayload {
  command: string;
  inCurrentTab?: boolean;
}

export interface CommandPaletteSearchVisitsPayload {
  query: string;
}

export interface Suggestion {
  url: string;
  title: string;
  visitCount: number;
}

export interface CommandPaletteSuggestionsEvent {
  suggestions: Suggestion[];
}

// ── Command registry ─────────────────────────────────────────────
export type CommandPaletteCommands = {
  [COMMAND_PALETTE_SHOW]: { payload: undefined; response: undefined };
  [COMMAND_PALETTE_HIDE]: { payload: undefined; response: undefined };
  [COMMAND_PALETTE_TOGGLE]: { payload: undefined; response: undefined };
  [COMMAND_PALETTE_EXECUTE]: { payload: CommandPaletteExecutePayload; response: undefined };
  [COMMAND_PALETTE_SEARCH_VISITS]: {
    payload: CommandPaletteSearchVisitsPayload;
    response: Suggestion[];
  };
};

// ── Event registry ───────────────────────────────────────────────
export type CommandPaletteEvents = {
  [COMMAND_PALETTE_SHOWN]: undefined;
  [COMMAND_PALETTE_HIDDEN]: undefined;
  [COMMAND_PALETTE_SUGGESTIONS]: CommandPaletteSuggestionsEvent;
};
