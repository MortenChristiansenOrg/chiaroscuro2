# Specification for Tabs Feature

## Overview

The Tabs feature is responsible for creating, switching, and closing tabs.

Each tab corresponds to a `WebContentsView` managed by the Electron main process. Tab switching is done by showing/hiding views, not destroying/creating them.

It also keeps the in-app tab list (the Sidebar) in sync with the actual set of open tabs, so you can always see which tabs exist, which one is active, and move tabs between "bookmarked/persistent" and "ephemeral/temporary" groups.

## Terminology

- **Tab**: A single open browsing session backed by a `WebContentsView`.
- **Active tab**: The tab currently shown in the main browser area.
- **Ephemeral tab**: A normal, temporary tab. Ephemeral tabs appear in the lower "ephemeral" list in the Sidebar. Auto-removed if older than 8 hours on startup.
- **Bookmarked tab**: A tab that is promoted to the persistent (top) list in the Sidebar.
- **Pinned tab**: A special kind of tab managed by the Pinned Tabs feature. Pinned tabs are not bookmarkable via this feature's bookmark shortcut.
- **Workspace**: A collection of tabs (and folder layout) that you can switch between.

## Requirements

### Core behavior

- Creating a new tab opens the requested address via a new `WebContentsView` and adds it to the tab list.
- Activating a tab shows that tab's `WebContentsView` and updates the tab list selection.
- Closing a tab destroys the `WebContentsView` and removes it from the tab list.
- Tab switching is done by showing/hiding views, not by destroying and recreating them.

### Workspaces

- When you switch to a workspace, the Sidebar tab list updates to show that workspace's tabs and their folder layout.
- The active tab after switching workspace is:
  - the active pinned tab (if a pinned tab is currently active), otherwise
  - the tab marked active in the workspace (if any).

### Bookmarking (persistent vs ephemeral)

- Toggling bookmark on the current tab moves it between the "bookmarked/persistent" list and the "ephemeral" list in the Sidebar.
- If the current tab is pinned, the bookmark toggle does nothing.

### Ephemeral tab cleanup

- On startup, ephemeral tabs older than 8 hours (based on `lastAccessedAt`) are automatically removed.

## Workflows

### Open a page

- When you trigger navigation from elsewhere in the app (for example, the command palette or link handling), the app can either:
  - navigate the current tab to the new address, or
  - create a new tab and navigate it to the new address.
- New tabs may be created in the background (preloaded) or activated immediately.

### Switch tabs

- Select a tab from the Sidebar tab list.
- The selected tab becomes the active tab.

### Close a tab

- Close a tab from the Sidebar tab list.
- If the closed tab was active, the UI may select another tab (most recently used), otherwise no active tab change is required.

### Switch workspace

- Switch to another workspace.
- The tab list updates to show that workspace's tabs and folders.
- The app activates the appropriate tab for the new workspace (see Requirements → Workspaces).

### Bookmark the current tab

- Toggle bookmark on the currently active tab.
- If the tab is not pinned, it moves between the bookmarked/persistent list and the ephemeral list.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **Ctrl-B**: Toggle tab as bookmark.

### Mouse interactions

In the Sidebar tab list:

- **Activate tab**: Click a tab to make it active.
- **Close tab**: Click the tab's close button.
- **Reorder tabs**: Drag a tab by its favicon/drag handle to reorder.
- **Move between groups**: Drag tabs between the persistent (top) and ephemeral (bottom) lists.
- **Clear ephemeral tabs**: Click **Clear** to close all ephemeral tabs.
- **Folder interactions (persistent list)**:
  - Click a folder header to open/close it.
  - Drag tabs into/out of folders by reordering.
  - Drag folders as a unit (folders cannot be nested, and folders cannot be moved into the ephemeral list).
  - Rename a folder via the folder UI.

## Commands & Events

### Commands

- `tabs:create` — Create a new tab. Payload: `{ url: string, activate?: boolean }`.
- `tabs:close` — Close a tab. Payload: `{ tabId: string }`.
- `tabs:activate` — Activate a tab. Payload: `{ tabId: string }`.
- `tabs:toggle-bookmark` — Toggle bookmark status for the current tab.
- `tabs:navigate` — Navigate the current tab to a URL. Payload: `{ url: string }`.
- `tabs:clear-ephemeral` — Close all ephemeral tabs in the current workspace.

### Events

- `tabs:created` — A new tab was created. Payload: `{ tab: Tab }`.
- `tabs:closed` — A tab was closed. Payload: `{ tabId: string }`.
- `tabs:activated` — A tab was activated. Payload: `{ tabId: string }`.
- `tabs:updated` — A tab's metadata changed (title, URL, loading state). Payload: `{ tabId: string, changes: Partial<Tab> }`.

## Unresolved Issues

- **Ctrl-B conflict**: Ctrl-B is typically "Bold" in text editors and rich text fields. May conflict with in-page behavior. Consider whether this is acceptable.
- **Tab memory management**: SPEC.md mentions lazy-loading tabs and limiting concurrent WebContentsViews. This spec doesn't define the eviction/hibernation policy for tabs when memory is constrained.
- **Session isolation**: SPEC.md mentions per-tab session isolation via `session.fromPartition()`. This spec doesn't address how isolated sessions interact with bookmarked/ephemeral tab lifecycle.
- **New tab behavior**: When creating a tab from the command palette, should it default to ephemeral? The spec doesn't define the default tab type for new tabs.
