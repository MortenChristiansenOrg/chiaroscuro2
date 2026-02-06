# Specification for App State Feature

## Overview

The App State feature remembers certain UI layout settings between app launches.

This includes the size of the Sidebar panel, the tab palette, and the window position/size.

## Terminology

- **App state**: user UI preferences that are restored on startup.
- **Sidebar width**: the width of the Sidebar panel.
- **Tab palette width**: the width of the tab palette overlay panel.

## Requirements

- When the user resizes the Sidebar panel, the new width must be saved.
- The saved Sidebar width must be restored on startup.
- When the user resizes the tab palette, the new width must be saved.
- The tab palette should remain closed until the user opens it, but it should use the previously saved width when shown.
- Window position and size must be persisted and restored on startup.

## Workflows

### Restore layout on startup

- Start the app.
- The Sidebar panel uses the last saved width (if any).
- The window restores to its last saved position and size.

### Resize and persist Sidebar

- Resize the Sidebar panel.
- When resizing completes, the new width is saved and used next time the app starts.

### Resize and persist tab palette

- Open the tab palette.
- Resize the tab palette.
- When resizing completes, the new width is saved and used the next time the tab palette opens.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Resize Sidebar**: Drag the Sidebar resize handle.
- **Resize tab palette**: Drag the tab palette resize handle.

## Commands & Events

### Commands

- `app-state:save` — Persist current app state to disk.

### Events

- `app-state:restored` — App state was restored on startup. Payload: `{ state: AppState }`.

## Unresolved Issues

- **Storage mechanism**: Should app state be stored in the SQLite database or in a separate JSON file? JSON is simpler for key-value layout data; SQLite is already used for structured data.
- **Multi-window state**: If multiple windows are open, which window's position/size is saved? Should each window's state be tracked independently?
- **Debouncing saves**: Resize events fire frequently. The save must be debounced to avoid excessive disk writes.
