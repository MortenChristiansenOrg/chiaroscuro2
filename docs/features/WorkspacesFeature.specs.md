# Specification for Workspaces Feature

## Overview

The Workspaces feature lets you organize your browsing into separate named workspaces, each with its own set of tabs (including tab ordering and folder layout).

Workspaces are primarily managed through the Action Context UI workspace switcher (icons along the top). The active workspace determines which tabs appear in the Action Context tab list.

See also: `TabsFeature.specs.md` for details on the tab list UI (persistent vs ephemeral tabs, folders, and tab ordering).

## Terminology

- **Workspace**: A named container with a color and icon.
- **Active workspace**: The workspace currently selected.
- **Workspace tabs**: The tabs that belong to a workspace, including their saved metadata and whether one is marked active.
- **Ephemeral tab start index**: The index separating persistent (bookmarked) tabs from ephemeral tabs within a workspace’s tab ordering.

## Requirements

### Workspace lifecycle

- The app always has at least one workspace.
- Workspaces can be created, updated (name/icon/color), and deleted.
- Deleting the last workspace is not allowed.
- Workspace definitions and tab state are persisted to disk and restored on startup.

### Workspace activation

- Switching workspace updates:
  - the active workspace state in the UI, and
  - the Action Context tab list to show the workspace’s tabs and folders.
- The host updates the current workspace color when the active workspace changes.

### Tab state persistence

- When the user changes tabs in the Action Context UI (reorder, move between persistent/ephemeral, folder changes, close tabs), the workspace’s tab state is saved.
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
- The tab list updates to the workspace’s saved tab set and folder layout.

### Create a workspace

- Open the workspace editor in “Create” mode.
- Choose a name, icon, and color.
- Save to create and immediately switch to the new workspace.

### Edit the current workspace

- Open the workspace editor in “Edit” mode.
- Update name, icon, and/or color.
- Save to apply.

### Delete a workspace

- Open the workspace editor in “Edit” mode.
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

In the Action Context workspace switcher:

- **Activate workspace**: Click a workspace icon.
- **Create workspace**: Click the “add workspace” button, fill the form, then click Create.
- **Edit workspace**: Click the “edit workspace” button, update fields, then click Update.
- **Delete workspace**: In edit mode, click Delete and confirm (only available when there is more than one workspace).
