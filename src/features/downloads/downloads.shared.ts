// ── Command names ────────────────────────────────────────────────
export const DOWNLOADS_CANCEL = "downloads:cancel" as const;
export const DOWNLOADS_PAUSE = "downloads:pause" as const;
export const DOWNLOADS_RESUME = "downloads:resume" as const;

// ── Event names ──────────────────────────────────────────────────
export const DOWNLOADS_STARTED = "downloads:started" as const;
export const DOWNLOADS_PROGRESS = "downloads:progress" as const;
export const DOWNLOADS_COMPLETED = "downloads:completed" as const;
export const DOWNLOADS_STATE_CHANGED = "downloads:state-changed" as const;

// ── Data types ───────────────────────────────────────────────────
export interface Download {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted";
}

// ── Command payloads ─────────────────────────────────────────────
export interface DownloadIdPayload {
  downloadId: string;
}

// ── Event payloads ───────────────────────────────────────────────
export interface DownloadsStartedEvent {
  download: Download;
}

export interface DownloadsProgressEvent {
  downloadId: string;
  receivedBytes: number;
  totalBytes: number;
}

export interface DownloadsCompletedEvent {
  downloadId: string;
  state: "completed" | "cancelled" | "interrupted";
}

export interface DownloadsStateChangedEvent {
  downloadId: string;
  state: "progressing" | "paused";
}

// ── Command registry ─────────────────────────────────────────────
export type DownloadsCommands = {
  [DOWNLOADS_CANCEL]: { payload: DownloadIdPayload; response: undefined };
  [DOWNLOADS_PAUSE]: { payload: DownloadIdPayload; response: undefined };
  [DOWNLOADS_RESUME]: { payload: DownloadIdPayload; response: undefined };
};

// ── Event registry ───────────────────────────────────────────────
export type DownloadsEvents = {
  [DOWNLOADS_STARTED]: DownloadsStartedEvent;
  [DOWNLOADS_PROGRESS]: DownloadsProgressEvent;
  [DOWNLOADS_COMPLETED]: DownloadsCompletedEvent;
  [DOWNLOADS_STATE_CHANGED]: DownloadsStateChangedEvent;
};
