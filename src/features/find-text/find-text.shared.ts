import type { TabId } from "../../shared/types";

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
export interface FindNextPayload {
  text: string;
}

export interface FindPreviousPayload {
  text: string;
}

export interface FindResultEvent {
  activeMatchOrdinal: number;
  matches: number;
}

// ── Command registry ─────────────────────────────────────────────
export type FindTextCommands = {
  [FIND_START]: { payload: undefined; response: undefined };
  [FIND_STOP]: { payload: undefined; response: undefined };
  [FIND_NEXT]: { payload: FindNextPayload; response: undefined };
  [FIND_PREVIOUS]: { payload: FindPreviousPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type FindTextEvents = {
  [FIND_STARTED]: undefined;
  [FIND_STOPPED]: undefined;
  [FIND_RESULT]: FindResultEvent;
};
