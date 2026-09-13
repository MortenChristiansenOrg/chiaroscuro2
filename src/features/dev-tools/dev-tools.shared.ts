import type { CommandTypes } from "../../bus/contract";
import type { commandContracts } from "./dev-tools.contracts";
// ── Command names ────────────────────────────────────────────────
export const DEVTOOLS_TOGGLE = "devtools:toggle" as const;
export const DEVTOOLS_TOGGLE_CHROME = "devtools:toggle-chrome" as const;

// ── Command registry ─────────────────────────────────────────────
export type DevToolsCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type DevToolsEvents = Record<string, never>;
