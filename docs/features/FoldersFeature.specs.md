# Specification for Folders Feature

## Overview

The Folders feature lets you organize bookmarked tabs into named, nestable groups within the Sidebar's persistent tab list.

Folders support unlimited nesting, drag-and-drop reordering, inline rename, collapse/expand, and context-menu creation. Folders are workspace-scoped.

See also: `SidebarFeature.specs.md` for the panel that hosts the folder UI.

## Terminology

- **Folder**: A named group of bookmarked tabs in the Sidebar persistent list.
- **Bookmarked tab**: A tab in the persistent (top) tab list.
- **Root-level folder**: A folder with no parent (`parentFolderId: null`).
- **Parent folder**: The folder that contains a given folder or tab.
- **Nested folder (subfolder)**: A folder inside another folder.
- **Collapsed state**: When collapsed, a folder's children (tabs and subfolders) are hidden in the Sidebar.
- **Unified ordering**: Folders and tabs at the same nesting level share a single `order` sequence. Folders sort before tabs at equal order values.

## Requirements

### Folder structure

- Only bookmarked (persistent) tabs can be placed in folders.
- Folders can be nested to unlimited depth.
- Circular nesting is prevented — a folder cannot be moved into its own descendant.
- Folders and tabs at the same level share a unified order sequence (folders sort before tabs at equal values).
- Empty folders persist (they are not auto-deleted).
- Folders are workspace-scoped — each workspace has its own folder tree.

### Folder lifecycle

- Creating a folder via `folders:create` adds a new empty folder named "New Folder" and triggers inline rename.
- Creating a folder via `folders:toggle` wraps the target bookmarked tab in a new folder and triggers inline rename.
- Removing a folder promotes its children (tabs and subfolders) to the removed folder's parent level; children are not deleted.

### Folder display

- Each folder shows a header with a folder icon and name.
- The folder icon cross-fades between `folder` (collapsed) and `folder-open` (expanded) icons (150ms transition).
- A delete button appears on hover (hidden during rename).
- Nested folders are indented relative to their parent.

## Workflows

### Create a folder from context menu

- Right-click empty space in the Sidebar persistent list.
- Select "Add folder".
- A new empty folder is created at root level with inline rename active.

### Create a subfolder

- Right-click a folder header.
- Select "Add subfolder".
- A new empty folder is created inside the target folder with inline rename active.

### Create a folder from toggle

- Invoke `folders:toggle` (no shortcut assigned).
- If the active bookmarked tab is not in a folder, a new folder is created containing that tab with inline rename active.
- If the active bookmarked tab is already in a folder, it is moved out to the folder's parent level.

### Rename a folder

- Double-click a folder header.
- The folder name becomes an editable text input (auto-focused, text selected).
- Press Enter or blur the input to commit. Press Escape to cancel.

### Collapse/expand a folder

- Click a folder header (single click).
- If expanded, the folder collapses (children hidden). If collapsed, it expands.

### Delete a folder

- Hover over a folder header to reveal the delete button.
- Click the delete button.
- The folder is removed; its children (tabs and subfolders) are promoted to the parent level.

### Drag-and-drop reorder/nest

- **Folder onto folder**: drag a folder over another folder header.
  - Top/bottom 25%: reorder as sibling (before/after target).
  - Middle 50%: nest into target folder (shown with drop highlight).
- **Folder onto tab**: reorder folder relative to the tab at the same level.
- **Tab onto folder header**:
  - Top/bottom 25%: reorder tab to just before/after the folder's subtree.
  - Middle 50%: nest tab into the folder (drop highlight, committed on drop).
- **Folder/tab onto root drop zone**: promotes item to root level.
- All live reorder events are throttled to 100ms. Positions animate with FLIP transitions (200ms).

## Interactions

### Keyboard shortcuts

No global keyboard shortcuts. Local keys within the inline rename input:

- **Enter**: Commit rename.
- **Escape**: Cancel rename.

Escape during any drag operation cancels the drag.

### Mouse interactions

- **Single-click folder header**: Toggle collapse/expand.
- **Double-click folder header**: Enter inline rename mode.
- **Hover folder header**: Reveal delete button (hidden during rename).
- **Click delete button**: Remove folder, promote children.
- **Drag folder**: Reorder or nest via drop zones (see Workflows).
- **Drag tab onto folder**: Nest tab into folder or reorder relative to folder.
- **Right-click empty sidebar area**: Context menu with "Add folder".
- **Right-click folder header**: Context menu with "Add subfolder".

## Commands & Events

### Commands

- `folders:toggle` — Toggle folder membership for a bookmarked tab. Payload: `{ tabId?: string }`. Uses active tab if omitted.
- `folders:create` — Create a new empty folder. Payload: `{ parentFolderId?: FolderId | null, workspaceId?: WorkspaceId }`.
- `folders:rename` — Rename a folder. Payload: `{ folderId: FolderId, name: string }`.
- `folders:toggle-collapse` — Toggle collapsed state. Payload: `{ folderId: FolderId }`.
- `folders:remove` — Remove a folder (promotes children). Payload: `{ folderId: FolderId }`.
- `folders:reorder` — Reorder or re-parent a folder. Payload: `{ folderId: FolderId, targetFolderId?: FolderId, targetTabId?: string, position?: "before" | "after", parentFolderId?: FolderId | null }`.

### Events

- `folders:changed` — Folder structure changed (full list broadcast). Payload: `{ folders: Folder[] }`.
- `folders:rename-requested` — Triggers inline rename UI. Payload: `{ folderId: FolderId }`. Emitted after `folders:toggle` creates a folder and after `folders:create`.

## Data Model

```ts
interface Folder {
  id: FolderId;                     // branded string (UUID)
  workspaceId: WorkspaceId;         // workspace scope
  name: string;                     // display name
  parentFolderId: FolderId | null;  // null = root level
  collapsed: boolean;               // whether children are hidden
  order: number;                    // unified ordering with tabs at same level
}
```

Persisted via DataStore (`"folders"` collection).

## Unresolved Issues

- **Maximum nesting depth**: Unlimited nesting is supported but deeply nested folders may degrade UX. Should a practical limit be enforced?
- **Drag affordance**: There is no dedicated drag handle — the entire folder header is draggable. Should a visible drag handle be added for discoverability?
