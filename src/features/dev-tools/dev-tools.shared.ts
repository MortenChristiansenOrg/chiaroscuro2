// ── Command names ────────────────────────────────────────────────
export const DEVTOOLS_TOGGLE = "devtools:toggle" as const;
export const DEVTOOLS_TOGGLE_CHROME = "devtools:toggle-chrome" as const;

// ── Command registry ─────────────────────────────────────────────
export type DevToolsCommands = {
  [DEVTOOLS_TOGGLE]: { payload: undefined; response: undefined };
  [DEVTOOLS_TOGGLE_CHROME]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type DevToolsEvents = Record<string, never>;
