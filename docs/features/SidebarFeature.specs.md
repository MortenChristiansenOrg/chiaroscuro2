# Specification for Sidebar Feature

## Overview

The Sidebar feature controls the visibility of the Sidebar panel.

The Sidebar panel contains the app's auxiliary UI, such as pinned tabs, the tab list, workspace switcher, and downloads. It uses an Arc Browser-inspired vertical layout.

See also:

- `TabsFeature.specs.md`
- `PinnedTabsFeature.specs.md`
- `WorkspacesFeature.specs.md`

## Requirements

- The Sidebar panel must be toggleable via a keyboard shortcut.
- The Sidebar is rendered as a React component within the browser chrome renderer process.

## Workflows

### Toggle the Sidebar panel

- Press the toggle shortcut.
- If the Sidebar panel is visible, it becomes hidden.
- If it is hidden, it becomes visible.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **Ctrl-S**: Toggle sidebar panel.

### Mouse interactions

- None.

## Commands & Events

### Commands

- `sidebar:toggle` — Toggle the sidebar panel visibility.

### Events

- `sidebar:visibility-changed` — Emitted when the sidebar becomes visible or hidden. Payload: `{ visible: boolean }`.

## Unresolved Issues

- **Ctrl-S conflict**: Ctrl-S is the universal "Save" shortcut in most applications and web pages. This will likely conflict with user expectations and in-page behavior. Consider an alternative shortcut.
- **Sidebar collapse behavior**: Should the sidebar collapse to zero width or to a narrow icon strip (like Arc)?
