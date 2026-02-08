# Specification for Workspaces Feature

## Overview

The Workspaces feature lets you organize your browsing into separate named workspaces, each with its own set of tabs (including tab ordering and folder layout).

Workspaces are primarily managed through the Sidebar workspace switcher (icons along the bottom). The active workspace determines which tabs appear in the Sidebar tab list.

See also: `TabsFeature.specs.md` for details on the tab list UI (persistent vs ephemeral tabs, folders, and tab ordering).

## Terminology

- **Workspace**: A named container with a color and icon.
- **Active workspace**: The workspace currently selected.
- **Workspace tabs**: The tabs that belong to a workspace, including their saved metadata and whether one is marked active.
- **Ephemeral tab start index**: The index separating persistent (bookmarked) tabs from ephemeral tabs within a workspace's tab ordering.

## Requirements

### Workspace lifecycle

- The app always has at least one workspace.
- Workspaces can be created, updated (name/icon/color), and deleted.
- Deleting the last workspace is not allowed.
- Workspace definitions and tab state are persisted to the database and restored on startup.

### Workspace activation

- Switching workspace updates:
  - the active workspace state in the UI, and
  - the Sidebar tab list to show the workspace's tabs and folders.
- The browser chrome updates the workspace background color when the active workspace changes.

### Tab state persistence

- When the user changes tabs in the Sidebar (reorder, move between persistent/ephemeral, folder changes, close tabs), the workspace's tab state is saved.
- The saved workspace state includes:
  - tab ordering,
  - which tabs are persistent vs ephemeral,
  - folder boundaries,
  - which tab is marked active.

### Move tab between workspaces

- You can move the current (non-pinned) tab to another workspace via a keyboard shortcut.
- Pinned tabs cannot be moved between workspaces.

### Restore original address

- You can restore the current tab to its original address (only for pinned or bookmarked tabs).
- If the current tab is neither pinned nor bookmarked, the restore action does nothing.

## Workflows

### Switch workspace

- Select another workspace.
- The workspace switcher highlights the new active workspace.
- The tab list updates to the workspace's saved tab set and folder layout.

### Create a workspace

- Open the workspace editor in "Create" mode.
- Choose a name, icon, and color.
- Save to create and immediately switch to the new workspace.

### Edit the current workspace

- Open the workspace editor in "Edit" mode.
- Update name, icon, and/or color.
- Save to apply.

### Delete a workspace

- Open the workspace editor in "Edit" mode.
- Choose Delete and confirm.
- If you deleted the currently active workspace, the app activates another remaining workspace.

### Move the current tab to another workspace

- Use the move shortcut to send the current tab to the target workspace.
- The app switches to the target workspace and adds the tab there.

### Restore a pinned/bookmarked tab

- While on a pinned or bookmarked tab, press the restore shortcut.
- The tab navigates back to the original address that was saved for it.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcuts:

- **Ctrl-R**: Restore a bookmarked or pinned tab to its original address.
- **Ctrl-1, Ctrl-2, Ctrl-3, etc.**: Switch to workspace 1, 2, 3, etc.
- **Ctrl-Shift-1, Ctrl-Shift-2, Ctrl-Shift-3, etc.**: Move current tab to workspace 1, 2, 3, etc.

### Mouse interactions

In the Sidebar workspace switcher:

- **Activate workspace**: Click a workspace icon.
- **Create workspace**: Click the "add workspace" button, fill the form, then click Create.
- **Edit workspace**: Click the "edit workspace" button, update fields, then click Update.
- **Delete workspace**: In edit mode, click Delete and confirm (only available when there is more than one workspace).

## Commands & Events

### Commands

- `workspaces:switch` — Switch to a workspace. Payload: `{ workspaceId: string }`.
- `workspaces:create` — Create a new workspace. Payload: `{ name: string, icon: string, color: string }`.
- `workspaces:update` — Update a workspace. Payload: `{ workspaceId: string, changes: Partial<Workspace> }`.
- `workspaces:delete` — Delete a workspace. Payload: `{ workspaceId: string }`.
- `workspaces:move-tab` — Move the current tab to a workspace. Payload: `{ targetWorkspaceId: string }`.
- `workspaces:restore-tab` — Restore the current tab to its original address.

### Events

- `workspaces:switched` — The active workspace changed. Payload: `{ workspaceId: string }`.
- `workspaces:created` — A workspace was created. Payload: `{ workspace: Workspace }`.
- `workspaces:updated` — A workspace was updated. Payload: `{ workspaceId: string, changes: Partial<Workspace> }`.
- `workspaces:deleted` — A workspace was deleted. Payload: `{ workspaceId: string }`.

## Unresolved Issues

- **Ctrl-R conflict**: Ctrl-R is the universal "Reload page" shortcut in browsers. Overriding this is very likely to frustrate users. Consider a different shortcut for restore, or use a modifier (e.g. Ctrl-Shift-R).
- **Workspace deletion and tabs**: What happens to the tabs in a deleted workspace? Are they moved to another workspace, closed, or lost?
- **Workspace icons**: Where do workspace icons come from? An icon picker? Emoji? Custom images?
- **Maximum workspaces**: Should there be a limit on the number of workspaces?
