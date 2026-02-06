# Specification for File Downloads Feature

## Overview

The File Downloads feature tracks file download progress and shows active downloads in the Action Context UI.

It supports both normal tab-initiated downloads and app-initiated background downloads.

## Terminology

- **Download**: a file transfer that saves data to disk.
- **Active download**: a download that is in progress.

## Requirements

- When a download starts, it must appear in the downloads UI with its filename and progress.
- Download progress should update periodically while the download is active.
- It must be possible to cancel an active download.
- Completed and cancelled downloads should stop counting as active.
- Completed/cancelled downloads may remain visible briefly before disappearing.

## Workflows

### View downloads

- Start a download.
- The download appears in the Action Context downloads UI with progress.

### Cancel a download

- Start a download.
- Use the cancel action for that download.
- The download is cancelled.

### Download completes

- Start a download and wait for it to finish.
- The download becomes completed.
- The completed entry remains visible briefly, then disappears.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

In the downloads UI (Action Context):

- **Cancel download**: Click the cancel control for an active download.
