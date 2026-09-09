import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  commandContracts,
  FindNextPayloadSchema,
  FindPreviousPayloadSchema,
} from "./find-text.contracts";
// ── Command names ────────────────────────────────────────────────
export const FIND_START = "find:start" as const;
export const FIND_STOP = "find:stop" as const;
export const FIND_NEXT = "find:next" as const;
export const FIND_PREVIOUS = "find:previous" as const;

// ── Event names ──────────────────────────────────────────────────
export const FIND_STARTED = "find:started" as const;
export const FIND_STOPPED = "find:stopped" as const;
export const FIND_RESULT = "find:result" as const;

// ── Payload types ────────────────────────────────────────────────
export type FindNextPayload = z.infer<typeof FindNextPayloadSchema>;

export type FindPreviousPayload = z.infer<typeof FindPreviousPayloadSchema>;

export interface FindResultEvent {
  activeMatchOrdinal: number;
  matches: number;
}

// ── Command registry ─────────────────────────────────────────────
export type FindTextCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type FindTextEvents = {
  [FIND_STARTED]: undefined;
  [FIND_STOPPED]: undefined;
  [FIND_RESULT]: FindResultEvent;
};
