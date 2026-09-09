import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { commandContracts, ExternalLinkOpenPayloadSchema } from "./external-link.contracts";
// ── Command names ────────────────────────────────────────────────
export const EXTERNAL_LINK_OPEN = "external-link:open" as const;

// ── Event names ──────────────────────────────────────────────────
export const EXTERNAL_LINK_RECEIVED = "external-link:received" as const;

// ── Payload types ────────────────────────────────────────────────
export type ExternalLinkOpenPayload = z.infer<typeof ExternalLinkOpenPayloadSchema>;

export interface ExternalLinkReceivedEvent {
  urls: string[];
}

// ── Command registry ─────────────────────────────────────────────
export type ExternalLinkCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type ExternalLinkEvents = {
  [EXTERNAL_LINK_RECEIVED]: ExternalLinkReceivedEvent;
};
