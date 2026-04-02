// ── Command names ────────────────────────────────────────────────
export const PDF_READER_FETCH = "pdf-reader:fetch" as const;
export const PDF_READER_GET_INDEX = "pdf-reader:get-index" as const;
export const PDF_READER_INDEX_ADD = "pdf-reader:index-add" as const;
export const PDF_READER_INDEX_UPDATE = "pdf-reader:index-update" as const;
export const PDF_READER_INDEX_DELETE = "pdf-reader:index-delete" as const;
export const PDF_READER_INDEX_REORDER = "pdf-reader:index-reorder" as const;

// ── Event names ──────────────────────────────────────────────────
export const PDF_READER_INDEX_CHANGED = "pdf-reader:index-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export type PdfBackendType = "pdfjs" | "mupdf";

export interface IndexEntry {
  id: string;
  label: string;
  page: number;
  order: number;
}

export interface PersistedPdfIndex {
  /** Storage key: `{filename}:{hash}` */
  id: string;
  entries: IndexEntry[];
}

export interface PdfFetchResponse {
  /** PDF binary data as base64 */
  dataBase64: string;
  hash: string;
  filename: string;
}

// ── Payload types ────────────────────────────────────────────────
export interface PdfFetchPayload {
  url: string;
}

export interface PdfGetIndexPayload {
  pdfKey: string;
}

export interface PdfIndexAddPayload {
  pdfKey: string;
  label: string;
  page: number;
}

export interface PdfIndexUpdatePayload {
  pdfKey: string;
  entryId: string;
  label?: string;
  page?: number;
}

export interface PdfIndexDeletePayload {
  pdfKey: string;
  entryId: string;
}

export interface PdfIndexReorderPayload {
  pdfKey: string;
  entryIds: string[];
}

export interface PdfIndexChangedEvent {
  pdfKey: string;
  entries: IndexEntry[];
}

// ── Command registry ─────────────────────────────────────────────
export type PdfReaderCommands = {
  [PDF_READER_FETCH]: { payload: PdfFetchPayload; response: PdfFetchResponse };
  [PDF_READER_GET_INDEX]: { payload: PdfGetIndexPayload; response: IndexEntry[] };
  [PDF_READER_INDEX_ADD]: { payload: PdfIndexAddPayload; response: undefined };
  [PDF_READER_INDEX_UPDATE]: { payload: PdfIndexUpdatePayload; response: undefined };
  [PDF_READER_INDEX_DELETE]: { payload: PdfIndexDeletePayload; response: undefined };
  [PDF_READER_INDEX_REORDER]: { payload: PdfIndexReorderPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type PdfReaderEvents = {
  [PDF_READER_INDEX_CHANGED]: PdfIndexChangedEvent;
};
