# Specification for Drag & Drop Feature

## Overview

The Drag & Drop feature lets you open local files by dragging them onto the browser window.

Each valid dropped file is opened in its own tab.

## Terminology

- **Dropped file**: a file dragged from the OS file manager into the app and released.
- **Supported file type**: a file with an extension the app can open in a tab.

## Requirements

- Dropping one or more supported files onto the app must open those files in tabs.
- Unsupported files should be ignored.
- When multiple files are dropped, the first opened tab should become the active tab.
- The dropped-file action should not prevent other files in the same drop from opening.
- Drag & drop is handled by intercepting drag events on the browser chrome's webContents and using `file://` URLs to open dropped files.

## Workflows

### Open files by dropping them

- Drag one or more files from the OS file manager onto the app.
- Release the mouse to drop them.
- The app opens each supported file in a tab (via `file://` URLs).
- The first opened tab becomes active.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Open files**: Drag one or more files onto the window and drop them.

## Commands & Events

### Commands

- `drag-drop:open-files` — Open dropped files as tabs. Payload: `{ filePaths: string[] }`.

### Events

- `drag-drop:files-dropped` — Files were dropped onto the window. Payload: `{ filePaths: string[] }`.

## Unresolved Issues

- **Supported file types**: The list of supported file types is not defined. At minimum, HTML/HTM files should be supported. What about images, PDFs, SVGs, plain text, etc.?
- **Drop target visual feedback**: Should the app show a drop zone overlay when files are being dragged over the window?
- **Security**: Opening local files via `file://` URLs may require adjusting Electron's security settings (e.g., `webSecurity`). Need to ensure this doesn't create security holes.
