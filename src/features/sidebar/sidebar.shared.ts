import type { CommandTypes } from "../../bus/contract";
import type { commandContracts } from "./sidebar.contracts";
// ── Command names ────────────────────────────────────────────────
export const SIDEBAR_TOGGLE = "sidebar:toggle" as const;

// ── Event names ──────────────────────────────────────────────────
export const SIDEBAR_VISIBILITY_CHANGED = "sidebar:visibility-changed" as const;

// ── Payload types ────────────────────────────────────────────────
export interface SidebarVisibilityChangedPayload {
  visible: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type SidebarCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type SidebarEvents = {
  [SIDEBAR_VISIBILITY_CHANGED]: SidebarVisibilityChangedPayload;
};
