import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type {
  commandContracts,
  IndexEntrySchema,
  PdfFetchPayloadSchema,
  PdfFetchResponseSchema,
  PdfGetIndexPayloadSchema,
  PdfIndexAddPayloadSchema,
  PdfIndexDeletePayloadSchema,
  PdfIndexReorderPayloadSchema,
  PdfIndexUpdatePayloadSchema,
} from "./pdf-reader.contracts";
// ── Command names ────────────────────────────────────────────────
export const PDF_READER_FETCH = "pdf-reader:fetch" as const;
export const PDF_READER_SET_ZOOM = "pdf-reader:set-zoom" as const;
export const PDF_READER_GET_INDEX = "pdf-reader:get-index" as const;
export const PDF_READER_INDEX_ADD = "pdf-reader:index-add" as const;
export const PDF_READER_INDEX_UPDATE = "pdf-reader:index-update" as const;
export const PDF_READER_INDEX_DELETE = "pdf-reader:index-delete" as const;
export const PDF_READER_INDEX_REORDER = "pdf-reader:index-reorder" as const;

// ── Event names ──────────────────────────────────────────────────
export const PDF_READER_INDEX_CHANGED = "pdf-reader:index-changed" as const;

// ── Data types ───────────────────────────────────────────────────

export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export interface PersistedPdfIndex {
  /** Storage key: `{filename}:{hash}` */
  id: string;
  entries: IndexEntry[];
}

export type PdfFetchResponse = z.infer<typeof PdfFetchResponseSchema>;

// ── Payload types ────────────────────────────────────────────────
export type PdfFetchPayload = z.infer<typeof PdfFetchPayloadSchema>;

export type PdfGetIndexPayload = z.infer<typeof PdfGetIndexPayloadSchema>;

export type PdfIndexAddPayload = z.infer<typeof PdfIndexAddPayloadSchema>;

export type PdfIndexUpdatePayload = z.infer<typeof PdfIndexUpdatePayloadSchema>;

export type PdfIndexDeletePayload = z.infer<typeof PdfIndexDeletePayloadSchema>;

export type PdfIndexReorderPayload = z.infer<typeof PdfIndexReorderPayloadSchema>;

export interface PdfIndexChangedEvent {
  pdfKey: string;
  entries: IndexEntry[];
}

// ── Command registry ─────────────────────────────────────────────
export type PdfReaderCommands = CommandTypes<typeof commandContracts>;

// ── Event registry ───────────────────────────────────────────────
export type PdfReaderEvents = {
  [PDF_READER_INDEX_CHANGED]: PdfIndexChangedEvent;
};
