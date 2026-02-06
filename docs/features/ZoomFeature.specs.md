# Specification for Zoom Feature

## Overview

The Zoom feature lets you zoom web content in and out in the current tab.

Zoom is applied to the active tab's `WebContentsView` using Electron's `webContents.setZoomLevel()` / `webContents.getZoomLevel()` API.

## Terminology

- **Zoom level**: the tab's current zoom value. Higher zoom means larger content.

## Requirements

- Zoom changes must only occur when a tab is active.
- Zoom changes must be possible using Ctrl + mouse wheel.
- Zoom level must be resettable via keyboard.
- Zoom level must be clamped to a reasonable range.

## Workflows

### Zoom in/out

- Hold Ctrl and scroll the mouse wheel.
- Scrolling up increases zoom, scrolling down decreases zoom.

### Reset zoom

- Press the reset shortcut.
- The current tab's zoom is reset to the default.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcuts:

- **Ctrl-MouseWheel**: Change zoom level.
- **Ctrl-Delete**: Reset zoom level.

### Mouse interactions

- **Zoom**: Hold Ctrl and scroll the mouse wheel.

## Commands & Events

### Commands

- `zoom:in` — Increase zoom level for the active tab.
- `zoom:out` — Decrease zoom level for the active tab.
- `zoom:reset` — Reset zoom level for the active tab to default.

### Events

- `zoom:changed` — Zoom level changed. Payload: `{ tabId: string, zoomLevel: number }`.

## Unresolved Issues

- **Standard zoom shortcuts**: Most browsers also support Ctrl+Plus / Ctrl+Minus for zoom in/out. These should probably be supported in addition to Ctrl+MouseWheel.
- **Ctrl-Delete for reset**: This is non-standard. Most browsers use Ctrl-0 to reset zoom. Consider using Ctrl-0 instead.
- **Per-domain zoom memory**: Should zoom levels be remembered per-domain (like Chrome) so that returning to a site restores its previous zoom level?
