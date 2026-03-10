// ── Command names ────────────────────────────────────────────────
export const DEBUG_SERVER_START = "debug-server:start" as const;
export const DEBUG_SERVER_STOP = "debug-server:stop" as const;

// ── Command registry ─────────────────────────────────────────────
export type DebugServerCommands = {
  [DEBUG_SERVER_START]: { payload: undefined; response: undefined };
  [DEBUG_SERVER_STOP]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type DebugServerEvents = Record<string, never>;
