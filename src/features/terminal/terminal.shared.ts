import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const TERMINAL_TOGGLE = "terminal:toggle" as const;
export const TERMINAL_CLEAR = "terminal:clear" as const;
export const TERMINAL_WRITE = "terminal:write" as const;

// ── Event names ──────────────────────────────────────────────────
export const TERMINAL_VISIBILITY_CHANGED = "terminal:visibility-changed" as const;
export const TERMINAL_OUTPUT = "terminal:output" as const;
export const TERMINAL_CLEARED = "terminal:cleared" as const;

// ── Data types ───────────────────────────────────────────────────
export interface TerminalLine {
  text: string;
  type: "stdout" | "stderr";
}

// ── Command payloads ─────────────────────────────────────────────
export interface TerminalWritePayload {
  tabId: TabId;
  data: string;
  type: "stdout" | "stderr";
}

// ── Event payloads ───────────────────────────────────────────────
export interface TerminalVisibilityChangedEvent {
  visible: boolean;
}

export interface TerminalOutputEvent {
  tabId: TabId;
  line: TerminalLine;
}

export interface TerminalClearedEvent {
  tabId: TabId;
}

// ── Command registry ─────────────────────────────────────────────
export type TerminalCommands = {
  [TERMINAL_TOGGLE]: { payload: undefined; response: undefined };
  [TERMINAL_CLEAR]: { payload: undefined; response: undefined };
  [TERMINAL_WRITE]: { payload: TerminalWritePayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type TerminalEvents = {
  [TERMINAL_VISIBILITY_CHANGED]: TerminalVisibilityChangedEvent;
  [TERMINAL_OUTPUT]: TerminalOutputEvent;
  [TERMINAL_CLEARED]: TerminalClearedEvent;
};
