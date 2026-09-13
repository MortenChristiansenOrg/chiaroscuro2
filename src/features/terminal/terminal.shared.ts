import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type { commandContracts, TerminalWritePayloadSchema } from "./terminal.contracts";

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
  id: string;
  text: string;
  type: "stdout" | "stderr";
}

// ── Command payloads ─────────────────────────────────────────────
export type TerminalWritePayload = z.infer<typeof TerminalWritePayloadSchema>;

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
export type TerminalCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type TerminalEvents = {
  [TERMINAL_VISIBILITY_CHANGED]: TerminalVisibilityChangedEvent;
  [TERMINAL_OUTPUT]: TerminalOutputEvent;
  [TERMINAL_CLEARED]: TerminalClearedEvent;
};
