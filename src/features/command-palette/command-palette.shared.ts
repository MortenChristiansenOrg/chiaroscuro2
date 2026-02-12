// ── Command names ────────────────────────────────────────────────
export const COMMAND_PALETTE_SHOW = "command-palette:show" as const;
export const COMMAND_PALETTE_HIDE = "command-palette:hide" as const;
export const COMMAND_PALETTE_TOGGLE = "command-palette:toggle" as const;

// ── Event names ──────────────────────────────────────────────────
export const COMMAND_PALETTE_SHOWN = "command-palette:shown" as const;
export const COMMAND_PALETTE_HIDDEN = "command-palette:hidden" as const;

// ── Command registry ─────────────────────────────────────────────
export type CommandPaletteCommands = {
  [COMMAND_PALETTE_SHOW]: { payload: undefined; response: undefined };
  [COMMAND_PALETTE_HIDE]: { payload: undefined; response: undefined };
  [COMMAND_PALETTE_TOGGLE]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type CommandPaletteEvents = {
  [COMMAND_PALETTE_SHOWN]: undefined;
  [COMMAND_PALETTE_HIDDEN]: undefined;
};
