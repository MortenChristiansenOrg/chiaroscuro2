# Specification for Drag & Drop Feature

## Overview

The Drag & Drop feature lets you open local files by dragging them onto the browser window.

Each valid dropped file is opened in its own tab.

## Terminology

- **Dropped file**: a file dragged from the OS into the app and released.
- **Supported file type**: a file with an extension the app can open in a tab.

## Requirements

- Dropping one or more supported files onto the app must open those files in tabs.
- Unsupported files should be ignored.
- When multiple files are dropped, the first opened tab should become the active tab.
- The dropped-file action should not prevent other files in the same drop from opening.

## Workflows

### Open files by dropping them

- Drag one or more files from Windows Explorer onto the app.
- Release the mouse to drop them.
- The app opens each supported file in a tab.
- The first opened tab becomes active.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Open files**: Drag one or more files onto the window and drop them.
