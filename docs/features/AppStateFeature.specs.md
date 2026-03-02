# Specification for App State Feature

## Overview

The App State feature remembers certain UI layout settings between app launches.

This includes the size of the Sidebar panel and the window position/size.

## Terminology

- **App state**: user UI preferences that are restored on startup.
- **Sidebar width**: the width of the Sidebar panel.

## Requirements

- The Sidebar panel must have a draggable resize handle on its right edge.
- When the user resizes the Sidebar panel, the new width must be saved.
- The saved Sidebar width must be restored on startup.
- Window position and size must be persisted and restored on startup.
- Saves must be debounced to avoid excessive disk writes during resize drags.
- App state is stored via `DataStore.setSetting()` (JSON key-value).

## Workflows

### Restore layout on startup

- Start the app.
- The Sidebar panel uses the last saved width (if any).
- The window restores to its last saved position and size.

### Resize and persist Sidebar

- Drag the Sidebar resize handle.
- The Sidebar width updates in real time during the drag.
- When the drag ends, the new width is saved (debounced).

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Resize Sidebar**: Drag the Sidebar resize handle on the right edge of the sidebar.

### Cross-feature interactions

- Listens to sidebar visibility events to know when sidebar is shown/hidden.
- Provides restored sidebar width to the sidebar renderer via event on startup.
- Tracks window bounds changes from the main process.

## Commands & Events

### Commands

- `app-state:save` — Persist current app state to disk.
- `app-state:set-sidebar-width` — Set sidebar width (from resize handle drag). Payload: `{ width: number }`.

### Events

- `app-state:restored` — App state was restored on startup. Payload: `{ sidebarWidth: number; windowBounds: { x: number; y: number; width: number; height: number } }`.
- `app-state:sidebar-width-changed` — Sidebar width changed. Payload: `{ width: number }`.

## Unresolved Issues

- **Multi-window state**: If multiple windows are open, which window's position/size is saved? For now, save the last-focused window's bounds.
