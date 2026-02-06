# Specification for Folders Feature

## Overview

The Folders feature lets you quickly group (or ungroup) the current bookmarked tab into a folder within the Sidebar tab list.

Folders apply to bookmarked (persistent) tabs in the current workspace.

See also: `TabsFeature.specs.md` for folder UI behavior (expanding/collapsing, renaming, and drag-and-drop reordering).

## Terminology

- **Folder**: a named group of bookmarked tabs in the Sidebar persistent list.
- **Bookmarked tab**: a tab in the persistent (top) tab list.

## Requirements

- The folder toggle must only operate on the currently active tab.
- Only bookmarked (persistent) tabs can be put into folders using the toggle.
- If the current bookmarked tab is not in a folder, toggling should create a folder containing that tab.
- If the current bookmarked tab is already in a folder, toggling should remove it from that folder.

## Workflows

### Toggle folder for the current bookmarked tab

- Activate a bookmarked tab.
- Press the folder toggle shortcut.
- If the tab was not in a folder, a folder is created containing the tab.
- If the tab was already in a folder, it is removed from the folder.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **Ctrl-G**: Toggle whether a bookmarked tab is placed in a folder or not.

### Mouse interactions

- None.

## Commands & Events

### Commands

- `folders:toggle` — Toggle folder membership for the current bookmarked tab.
- `folders:rename` — Rename a folder. Payload: `{ folderId: string, name: string }`.

### Events

- `folders:changed` — Folder structure changed. Payload: `{ workspaceId: string }`.

## Unresolved Issues

- **Folder creation UX**: When a folder is created via the toggle shortcut, what is the default folder name? Is the user prompted to name it immediately?
- **Empty folders**: What happens when all tabs are removed from a folder? Is the empty folder automatically deleted or does it persist?
- **Ctrl-G conflict**: Ctrl-G is "Go to line" in many editors and "Find next" in some apps. Relatively low risk for a browser but worth noting.
