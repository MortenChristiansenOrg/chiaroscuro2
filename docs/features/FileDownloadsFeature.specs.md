# Specification for File Downloads Feature

## Overview

The File Downloads feature tracks file download progress and shows active downloads in the Sidebar.

Downloads are intercepted in the Electron main process via `session.on('will-download')` and tracked through the `DownloadItem` API.

## Terminology

- **Download**: a file transfer that saves data to disk.
- **Active download**: a download that is in progress.

## Requirements

- When a download starts, it must appear in the downloads UI with its filename and progress.
- Download progress should update periodically while the download is active.
- It must be possible to cancel an active download (via `downloadItem.cancel()`).
- It must be possible to pause and resume a download (via `downloadItem.pause()` / `downloadItem.resume()`).
- Completed and cancelled downloads should stop counting as active.
- Completed/cancelled downloads may remain visible briefly before disappearing.
- Files are saved to the desktop.

## Workflows

### View downloads

- Start a download.
- The download appears in the Sidebar downloads UI with progress.

### Cancel a download

- Start a download.
- Use the cancel action for that download.
- The download is cancelled.

### Pause/resume a download

- Start a download.
- Use the pause action to pause it.
- Use the resume action to resume it.

### Download completes

- Start a download and wait for it to finish.
- The download becomes completed.
- The completed entry remains visible briefly, then disappears.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

In the downloads UI (Sidebar):

- **Cancel download**: Click the cancel control for an active download.
- **Pause/resume download**: Click the pause/resume control for an active download.

## Commands & Events

### Commands

- `downloads:cancel` — Cancel an active download. Payload: `{ downloadId: string }`.
- `downloads:pause` — Pause an active download. Payload: `{ downloadId: string }`.
- `downloads:resume` — Resume a paused download. Payload: `{ downloadId: string }`.

### Events

- `downloads:started` — A new download started. Payload: `{ download: Download }`.
- `downloads:progress` — Download progress updated. Payload: `{ downloadId: string, receivedBytes: number, totalBytes: number }`.
- `downloads:completed` — A download finished. Payload: `{ downloadId: string, state: 'completed' | 'cancelled' | 'interrupted' }`.
