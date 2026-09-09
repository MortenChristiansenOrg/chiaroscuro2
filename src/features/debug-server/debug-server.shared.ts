import type { CommandTypes } from "../../bus/contract";
import type { commandContracts } from "./debug-server.contracts";
// ── Command names ────────────────────────────────────────────────
export const DEBUG_SERVER_START = "debug-server:start" as const;
export const DEBUG_SERVER_STOP = "debug-server:stop" as const;

// ── Command registry ─────────────────────────────────────────────
export type DebugServerCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type DebugServerEvents = Record<string, never>;
