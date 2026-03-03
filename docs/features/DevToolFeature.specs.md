# Specification for Dev Tools Feature

## Overview

The Dev Tools feature controls Chromium developer tools for tabs. In Electron, dev tools are managed via `webContents.openDevTools()` / `webContents.closeDevTools()` on each tab's `WebContentsView`.

Additionally, in dev mode, the application chrome/renderer devtools can be opened for debugging the shell UI.

## Terminology

- **Tab devtools**: Chromium developer tools for a tab's WebContentsView, docked to the right side of the tab content.
- **Chrome devtools**: Developer tools for the application shell/renderer BrowserWindow. Opens in a separate window. Dev mode only.

## Requirements

- The active tab's devtools must be toggleable via F12, opening docked to the right side of the tab.
- Devtools belong to their tab. When switching tabs, devtools are not closed — they remain open but are only visible when their owner tab is active. This is handled naturally by Electron's native docking: the devtools panel is part of the WebContentsView, so it shows/hides with the tab.
- When a tab is closed, its devtools are automatically destroyed by Electron (the WebContentsView is destroyed).
- In dev mode, F11 toggles devtools for the application chrome/renderer in a separate window.
- F11 must be a no-op in production builds.

## Workflows

### Toggle devtools for the current tab

1. Press F12.
2. If devtools are closed for the active tab, they open docked right.
3. If devtools are already open, they close.
4. If no tab is active, nothing happens.

### Switch tabs with devtools open

1. Tab A has devtools open (docked right).
2. User switches to Tab B.
3. Tab A (including its docked devtools) is hidden.
4. Tab B is shown. If Tab B also had devtools open, they reappear docked right.
5. Switching back to Tab A shows it with devtools still open.

### Toggle chrome devtools (dev mode)

1. Press F11.
2. If chrome devtools are closed, they open in a separate window.
3. If chrome devtools are already open, they close.

## Interactions

### Keyboard shortcuts

- **F12**: Toggle tab devtools (docked right) for the active tab.
- **F11**: Toggle chrome/renderer devtools (dev mode only, separate window).

### Mouse interactions

- None.

### Cross-feature interactions

- Listens to `tabs:closed` to clean up devtools state tracking.
- Reads active tab ID from deps to know which tab to toggle.

## Commands & Events

### Commands

- `devtools:toggle` — Toggle devtools for the active tab. Opens docked right.
- `devtools:toggle-chrome` — Toggle chrome/renderer devtools. Dev mode only.

### Events

- None.

## Unresolved Issues

- None.
