# Specification for Pinned Tabs Feature

## Overview

The Pinned Tabs feature lets you keep a small set of tabs "always available", independent of your current workspace.

Pinned tabs are shown as a compact strip of icons in the Sidebar. You can quickly switch to a pinned tab at any time.

This feature is closely related to:

- `TabsFeature`: pinned tabs are activated like normal tabs, but they are not part of the normal tab list.
- `WorkspacesFeature`: when a pinned tab is active, it takes precedence over a workspace's "active tab".

See also: `TabsFeature.specs.md` for tab terminology and the Sidebar tab list behavior.

## Terminology

- **Pinned tab**: A tab stored in the pinned-tabs list and persisted to disk.
- **Active pinned tab**: The pinned tab that is currently active (if any).

## Requirements

### Pin / unpin

- A pinned tab is removed from the normal tab list (workspace tabs) and instead appears in the pinned tab strip.
- Unpinning returns the tab back to the normal tab list.
- The feature persists pinned tabs to SQLite and restores them on startup.

### Active pinned tab

- When you activate a tab, the pinned-tabs state tracks whether the newly active tab is one of the pinned tabs.
- If a non-pinned tab is active, there is no active pinned tab.

### Title/favicon updates

- The pinned tabs UI must show each pinned tab's current title/favicon.
- Pinned tab state is not continuously updated by default. The persisted pinned-tab entry is only updated when the tab has "fixed address" disabled via tab customization.

## Workflows

### Pin the current tab

- Press the pin shortcut.
- The current tab is added to the pinned tabs list and removed from the normal tab list.

### Unpin the active pinned tab

- Switch to a pinned tab.
- Press the pin shortcut.
- The active pinned tab is removed from the pinned list and returned to the normal tab list.

### Switch to a pinned tab

- Click a pinned tab icon.
- That tab becomes the active tab.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **Ctrl-P**: Toggle whether the current tab is pinned or not.

### Mouse interactions

In the pinned tabs strip (Sidebar):

- **Activate pinned tab**: Click a pinned tab icon.

## Commands & Events

### Commands

- `pinned-tabs:toggle-pin` — Pin or unpin the current tab.
- `pinned-tabs:activate` — Activate a specific pinned tab by ID.

### Events

- `pinned-tabs:changed` — Emitted when the pinned tabs list changes (pin/unpin). Payload: `{ tabs: PinnedTab[] }`.
- `pinned-tabs:active-changed` — Emitted when the active pinned tab changes. Payload: `{ tabId: string | null }`.

## Unresolved Issues

- **Ctrl-P conflict**: Ctrl-P is the universal "Print" shortcut. This will conflict with web page print functionality. Consider an alternative.
- **Pinned tab limit**: Should there be a maximum number of pinned tabs to prevent the strip from becoming unwieldy?
- **Pinned tab ordering**: The spec doesn't define how pinned tabs are ordered or whether they can be reordered via drag-and-drop.
