# Specification for Dev Tools Feature

## Overview

The Dev Tools feature controls Chromium developer tools for tabs. In Electron, dev tools are managed via `webContents.openDevTools()` / `webContents.closeDevTools()` on each tab's `WebContentsView`.

## Terminology

- **Dev tools**: the Chromium developer tools window.

## Requirements

- The active tab's dev tools must be toggleable via a keyboard shortcut.
- When a tab is closed, any dev tools belonging to it are automatically closed by Electron (the `WebContentsView` is destroyed).
- When switching tabs, dev tools for the previously active tab must be closed.

## Workflows

### Toggle dev tools for the current tab

- Press the dev tools shortcut.
- If dev tools are open for the current tab, they close.
- If dev tools are closed, they open.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **F12**: Toggle dev tools.

### Mouse interactions

- None.

## Commands & Events

### Commands

- `devtools:toggle` — Toggle dev tools for the active tab.

### Events

- None.

## Unresolved Issues

- **Dev tools docking mode**: Should dev tools open as a separate window, docked to the bottom, or docked to the right? Electron supports all modes via the `mode` parameter. Consider making this configurable or defaulting to a separate window.
- **Browser chrome dev tools**: For development purposes, should there be a separate shortcut to open dev tools for the browser chrome (renderer) itself? This is useful for debugging the React UI.
