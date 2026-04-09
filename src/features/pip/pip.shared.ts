import type { TabId } from "../../shared/types";

// ── Command names ────────────────────────────────────────────────
export const PIP_CLOSE = "pip:close" as const;
export const PIP_TOGGLE_PLAY = "pip:toggle-play" as const;
export const PIP_RETURN_TO_TAB = "pip:return-to-tab" as const;

// ── Event names ──────────────────────────────────────────────────
export const PIP_ACTIVATED = "pip:activated" as const;
export const PIP_DEACTIVATED = "pip:deactivated" as const;
export const PIP_PLAY_STATE_CHANGED = "pip:play-state-changed" as const;

// ── Payload types ────────────────────────────────────────────────
export interface PipActivatedEvent {
  tabId: TabId;
}

export interface PipPlayStateChangedEvent {
  playing: boolean;
}

// ── Command registry ─────────────────────────────────────────────
export type PipCommands = {
  [PIP_CLOSE]: { payload: undefined; response: undefined };
  [PIP_TOGGLE_PLAY]: { payload: undefined; response: undefined };
  [PIP_RETURN_TO_TAB]: { payload: undefined; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type PipEvents = {
  [PIP_ACTIVATED]: PipActivatedEvent;
  [PIP_DEACTIVATED]: undefined;
  [PIP_PLAY_STATE_CHANGED]: PipPlayStateChangedEvent;
};
