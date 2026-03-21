// ── Command names ────────────────────────────────────────────────
export const EXTERNAL_LINK_OPEN = "external-link:open" as const;

// ── Event names ──────────────────────────────────────────────────
export const EXTERNAL_LINK_RECEIVED = "external-link:received" as const;

// ── Payload types ────────────────────────────────────────────────
export interface ExternalLinkOpenPayload {
  url: string;
}

export interface ExternalLinkReceivedEvent {
  urls: string[];
}

// ── Command registry ─────────────────────────────────────────────
export type ExternalLinkCommands = {
  [EXTERNAL_LINK_OPEN]: { payload: ExternalLinkOpenPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type ExternalLinkEvents = {
  [EXTERNAL_LINK_RECEIVED]: ExternalLinkReceivedEvent;
};
