// ── Command names ────────────────────────────────────────────────
export const DRAG_DROP_OPEN_FILES = "drag-drop:open-files" as const;

// ── Event names ──────────────────────────────────────────────────
export const DRAG_DROP_FILES_DROPPED = "drag-drop:files-dropped" as const;

// ── Payload types ────────────────────────────────────────────────
export interface DragDropOpenFilesPayload {
  filePaths: string[];
}

export interface DragDropFilesDroppedEvent {
  filePaths: string[];
}

// ── Supported extensions ─────────────────────────────────────────
/** Curated allowlist of file extensions opened as browser tabs on drop. */
export const SUPPORTED_EXTENSIONS = new Set([
  "html",
  "htm",
  "svg",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "txt",
  "json",
  "xml",
  "css",
  "js",
  "mjs",
]);

export function isSupportedFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(ext);
}

// ── Command registry ─────────────────────────────────────────────
export type DragDropCommands = {
  [DRAG_DROP_OPEN_FILES]: { payload: DragDropOpenFilesPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type DragDropEvents = {
  [DRAG_DROP_FILES_DROPPED]: DragDropFilesDroppedEvent;
};
