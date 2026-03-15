# Specification for Sub-Tabs Feature

## Overview

Sub-tabs (also called child tabs) are overlay popups that open on top of the parent tab when following links, instead of navigating the parent tab or opening a new standalone tab. This is similar to Arc Browser's and Zen Browser's "Little Arc" / peek behavior.

Sub-tabs keep the user's context by avoiding full tab switches for casual link-following. They can be dismissed by clicking outside, or promoted to standalone tabs when the user wants to keep them.

## Terminology

- **Sub-tab**: A WebContentsView displayed as a centered overlay popup on top of the parent tab. Not shown in the sidebar.
- **Parent tab**: The regular tab that a sub-tab is attached to. The parent tab remains visible (dimmed) behind the sub-tab.
- **Sub-tab stack**: An ordered list of sub-tabs attached to a single parent. Links opened from within a sub-tab push a new sub-tab onto the stack.
- **Promote**: Convert a sub-tab into a standalone tab, reusing the same WebContentsView/session so the page doesn't reload.
- **Dismiss**: Close a sub-tab (and all sub-tabs above it in the stack) by clicking outside it or pressing Escape.

## Requirements

### When sub-tabs open

- Links that would open in a new window (`target="_blank"`, `window.open()`) open as a sub-tab instead of navigating the parent tab.
- Exception: Ctrl+Click and middle-mouse-click open a new standalone tab (the user explicitly wants a dedicated tab).
- Sub-tabs are attached to whichever tab triggered the open (the parent tab, or another sub-tab's parent if opened from within a sub-tab).

### Display

- Sub-tab appears as a centered overlay covering ~80% width and ~85% height of the content area.
- The area outside the sub-tab shows a semi-transparent dark backdrop.
- The backdrop is clickable — clicking it dismisses the sub-tab.
- Sub-tabs have a small header bar showing: page title, URL, a promote button, and a close button.
- Only the topmost sub-tab in the stack is visible (previous sub-tabs are hidden behind it).
- Sub-tabs must not obscure the command palette — the command palette's z-index takes priority.

### Sub-tab stack

- Each parent tab has its own sub-tab stack (zero or more sub-tabs).
- Opening a link from within a sub-tab pushes a new sub-tab onto the stack.
- Closing the topmost sub-tab pops it and reveals the previous sub-tab (or the parent if stack is now empty).
- Closing the parent tab closes all its sub-tabs.
- Switching to a different parent tab hides that parent's sub-tab stack; switching back reveals it.

### Promotion

- Clicking the promote button converts the sub-tab into a standalone ephemeral tab.
- The WebContentsView is reused (no page reload, same session, same scroll position).
- The promoted tab appears in the sidebar and becomes the active tab.
- The sub-tab is removed from the stack. Any sub-tabs above it in the stack are closed.

### Lifecycle

- Sub-tabs are purely transient — not persisted, not restored on restart.
- Sub-tabs do not appear in the sidebar tab list.
- Sub-tabs do not affect the parent tab's URL, title, or favicon in the sidebar.

### Navigation within sub-tab

- Same-page and cross-page navigation within a sub-tab stays in that sub-tab (does not auto-promote).

## Workflows

### Follow a link from a page

1. User clicks a `target="_blank"` link on the active tab.
2. A sub-tab overlay opens showing the linked page.
3. The parent tab is dimmed behind the overlay.

### Open a dedicated tab instead

1. User Ctrl+clicks or middle-clicks a link.
2. A new standalone tab opens (existing behavior).
3. No sub-tab overlay appears.

### Dismiss a sub-tab

1. User clicks the backdrop area outside the sub-tab, or presses Escape.
2. The topmost sub-tab closes.
3. If there are more sub-tabs in the stack, the next one is revealed.
4. If the stack is empty, the parent tab is fully visible again.

### Promote a sub-tab to a standalone tab

1. User clicks the promote button in the sub-tab header.
2. The sub-tab's WebContentsView is reclassified as a standalone tab (no reload).
3. The new tab appears in the sidebar and is activated.
4. The sub-tab overlay closes.

### Navigate within a sub-tab

1. User clicks a regular link inside the sub-tab.
2. The sub-tab navigates to the new page (stays as sub-tab).

### Link opens from within a sub-tab

1. User clicks a `target="_blank"` link inside a sub-tab.
2. A new sub-tab is pushed onto the stack on top of the current one.
3. The previous sub-tab is hidden.

## Interactions

### Keyboard shortcuts

- **Escape**: Dismiss the topmost sub-tab (when a sub-tab is open).

### Mouse interactions

- **Click backdrop**: Dismiss the topmost sub-tab.
- **Click promote button**: Promote sub-tab to standalone tab.
- **Click close button**: Dismiss the topmost sub-tab.
- **Ctrl+Click / Middle-click a link**: Bypass sub-tab, open as standalone tab.

### Cross-feature interactions

- **Tabs feature**: Sub-tabs use the same `platform.createTab()` for WebContentsView creation. Promotion converts a sub-tab into a regular tab via the tabs feature. Closing the parent tab closes all sub-tabs.
- **Window chrome**: Address bar continues to show the parent tab's URL when a sub-tab is open.
- **Sidebar**: Sub-tabs are invisible to the sidebar until promoted.

## Commands & Events

### Commands

- `sub-tabs:open` — Open a URL as a sub-tab. Payload: `{ parentTabId: TabId, url: string }`.
- `sub-tabs:close` — Close the topmost sub-tab for a parent. Payload: `{ parentTabId: TabId }`.
- `sub-tabs:close-all` — Close all sub-tabs for a parent. Payload: `{ parentTabId: TabId }`.
- `sub-tabs:promote` — Promote the topmost sub-tab to a standalone tab. Payload: `{ parentTabId: TabId }`.
- `sub-tabs:get-stack` — Query the sub-tab stack for a parent. Payload: `{ parentTabId: TabId }`.

### Events

- `sub-tabs:opened` — A sub-tab was opened. Payload: `{ parentTabId: TabId, subTab: SubTab }`.
- `sub-tabs:closed` — A sub-tab was closed. Payload: `{ parentTabId: TabId, subTabId: TabId }`.
- `sub-tabs:promoted` — A sub-tab was promoted. Payload: `{ parentTabId: TabId, subTabId: TabId, newTabId: TabId }`.
- `sub-tabs:stack-changed` — The sub-tab stack changed. Payload: `{ parentTabId: TabId, stack: SubTab[] }`.
- `sub-tabs:updated` — A sub-tab's metadata changed (title, URL, loading). Payload: `{ parentTabId: TabId, subTab: SubTab }`.

## Unresolved Issues

- **Keyboard shortcut for promote**: Should there be a keyboard shortcut (e.g., Ctrl+Shift+Enter) to promote without clicking the button?
- **Back navigation**: Should a back-navigation in a sub-tab that reaches the beginning of history dismiss the sub-tab instead of showing a blank page?
- **Download handling**: If a sub-tab triggers a download, should the download proceed normally or should the sub-tab be auto-promoted first?
- **Find in page**: Should Ctrl+F find-in-page work within the sub-tab when one is open?
