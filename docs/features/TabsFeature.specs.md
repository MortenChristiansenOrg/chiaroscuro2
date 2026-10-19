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
- When the browser window is activated again (switching back from another app or window, or closing the command palette), keyboard focus returns to the shown page if it had focus, so a focused input keeps receiving typing.

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
- If the page warns about unsaved changes (`beforeunload`), a native prompt asks "Leave this page?", naming the page by title and address. **Leave** closes the tab; **Stay** keeps it with its unsaved state. Clearing ephemeral tabs asks once per such page and still closes the others.
- A tab that is not shown, closed from the Sidebar, by clearing ephemeral tabs or by an extension, is shown before it is asked about, as when quitting and as Chrome does (#150): the browser switches to it (and to its workspace) and waits briefly for it to paint, so the prompt appears over the page it asks about. Pages that do not warn close without being shown. After either answer, the browser goes back to the tab and workspace the user was on, unless the user moved to another tab meanwhile; with no such tab, the page stays shown on **Stay**, and another tab is selected on **Leave** as when closing the active tab.
- A tab closed while quitting or closing the browser window asks about (see below) shares the quit's answers (#151): the page is asked about once. **Stay** cancels the quit, as staying in the quit's own prompt does, and shows the page; **Leave** closes the tab and the quit goes on.

### Quit or close the browser window

- Quitting, closing the browser window (also Alt+F4 in a sub-tab) and restarting to apply an update ask "Leave this page?" once for each page that warns about unsaved changes, as Chrome does. There is no combined prompt: the app learns that a page warns only by closing it.
- Pages are closed one at a time to run their warnings: pop-up and extension windows first (closing the page that opened a pop-up would close it without asking), then the sub-tab on top, the shown tab and the other tabs.
- Before asking about a page, the browser shows it, as Chrome does (#140): it switches to the page's workspace and tab, or to its sub-tab, or brings its pop-up or extension window to the front, and waits briefly for it to paint. The prompt thus appears over the page it asks about, not over another page or one already left. Pages that do not warn are closed without being shown or slowing quitting.
- The prompt names the page: its title in the title bar and above the message, followed by its address (without `https://`, shortened past 100 characters), so pages with the same title can be told apart.
- After **Leave** on every prompt, the last page shown is the active tab and workspace of the next session.
- **Leave** on every prompt quits. Every tab is kept for the next session, including the ones whose pages were closed while asking.
- **Stay** cancels the quit or window close, including Stay answered for a tab the user closed while the quit was asking. The tab list stays intact, nothing is torn down, and the page the user stayed on is shown with its unsaved changes, switching to its workspace if needed. Pages checked before it are gone, but their tabs remain as unloaded tabs that load again when shown (the shown tab loads at once). Pages after it are untouched.
- Unloaded tabs that never loaded a page and crashed pages are not asked about. Quitting never waits on pages: a page that does not finish closing within 3 seconds is passed over, and after 5 seconds of waiting in total (time spent answering prompts excluded) the rest are not asked about. Showing a page before asking about it counts as time spent answering, and waits at most 1.5 seconds. A page passed over that asks later still stops the quit if the user stays while other pages are being asked about; once quitting is confirmed it closes without asking.
- The operating system ending the session (Windows log off, shutdown or restart; Linux and macOS shutdown or restart) quits without asking. A termination signal (`SIGTERM`, `SIGINT`) quits like the user did and may ask; a second signal terminates the app at once.

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
  - Drag folders as a unit (folders cannot be moved into the ephemeral list). See `FoldersFeature.specs.md` for folder nesting and reorder details.
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

### Duplicate tab

Right-click a normal, bookmarked, or pinned web tab and choose **Duplicate tab**
(`tabs:duplicate`, `{ tabId }`). The copy is ephemeral and belongs to the
source workspace (global pinned tabs duplicate into the current workspace); it does not copy a bookmark, pin, folder assignment, or tab
customization. Chromium's cloned navigation controller retains back and forward
history and the current entry. The current page reloads, creating a fresh DOM and
JavaScript heap. The source session and current zoom are preserved, with subsequent
zoom and navigation independent in each tab. Both contents use the normal platform
listeners, navigation guards, permissions, shortcuts, and cleanup.

A restored but unloaded source has only its persisted URL available, so the copy
loads that URL. Built-in pages and PDF reader tabs have no web navigation controller:
the menu item is disabled and the command returns no tab. Missing sources also
return no tab; native cloning errors leave the source unchanged. Copies in the
current workspace activate immediately. A command targeting a non-pinned tab in
an inactive workspace creates its copy there in the background.
