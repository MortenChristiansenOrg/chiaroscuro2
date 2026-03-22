# Specification for Tab Context Menu Feature

## Overview

Custom context menu for right-clicking content within tab web pages. Shows context-aware actions (copy, download, search) depending on what element is under the cursor. Defers to the website's own context menu when the page handles the event.

## Terminology

- **Context params**: Electron's `ContextMenuParams` from the WebContents `context-menu` event — contains info about what was right-clicked (link URL, image URL, selected text, media type, etc.).
- **Context type**: Derived from params — one of `image`, `link`, `selection`, or `none`.

## Requirements

- When a user right-clicks inside a tab, detect what is under the cursor.
- If the website handles the `contextmenu` event (prevents default), do nothing — let the page's own menu show.
- If the website does not handle `contextmenu`, show a custom context menu overlay with context-appropriate actions.
- **Image context**: Show "Copy image" and "Download image" actions.
- **Selected text context**: Show "Copy" and "Search with [provider]" actions. The search provider is the user's configured default.
- **Link context**: Show "Copy link" actions.
- Contexts can overlap (e.g., selected text on a link). Show combined items when multiple contexts apply.
- Use the same native overlay context menu component used by the sidebar.
- Use Font Awesome icons: `fa-copy` for all copy operations, `fa-download` for download, `fa-magnifying-glass` for search.
- Actions execute in the main process (clipboard write, download trigger, tab navigation for search).

## Workflows

### Right-click on image

1. User right-clicks an image in a tab.
2. Custom context menu appears with "Copy image" and "Download image".
3. "Copy image" writes the image to clipboard (as image data, not URL).
4. "Download image" triggers a download of the image URL.

### Right-click on selected text

1. User selects text, then right-clicks.
2. Custom context menu appears with "Copy" and "Search with Google" (or configured default provider).
3. "Copy" writes selected text to clipboard.
4. "Search" opens a new tab with the search query.

### Right-click on link

1. User right-clicks a hyperlink.
2. Custom context menu appears with "Copy link".
3. "Copy link" writes the link URL to clipboard.

### Right-click on page background

1. User right-clicks empty area with no selection.
2. No custom context menu shown (nothing actionable).

### Website has own context menu

1. User right-clicks in a page that handles `contextmenu` (e.g., Google Docs, VS Code web).
2. The page's own menu appears. Our custom menu does not show.

## Interactions

### Mouse interactions

- **Right-click**: Shows context menu at cursor position.
- **Left-click on menu item**: Executes the action and dismisses menu.
- **Click outside menu**: Dismisses menu.
- **Escape key**: Dismisses menu.

### Cross-feature interactions

- **context-menu feature**: Uses `CONTEXT_MENU_SHOW` command to display the overlay.
- **tabs feature**: Listens to `TABS_CREATED` to attach `context-menu` event listeners per tab. Uses `TABS_CLOSED` for cleanup. Uses `TABS_CREATE` for search action.
- **settings feature**: Reads `SETTINGS_GET` to determine default search provider.

## Commands & Events

### Commands

- `tab-context-menu:copy-text` — Copy text to clipboard. Payload: `{ text: string }`.
- `tab-context-menu:copy-image` — Copy image to clipboard at coordinates. Payload: `{ tabId: TabId; x: number; y: number }`.
- `tab-context-menu:download-image` — Download image. Payload: `{ url: string; tabId: TabId }`.
- `tab-context-menu:search-text` — Search selected text with default provider. Payload: `{ text: string }`.

### Events

None — all actions are fire-and-forget commands with no state to sync.

## Unresolved Issues

- Should "Copy image" copy the image data (bitmap) or the image URL? Copying data is more useful but requires fetching. → Decision: copy as image data (nativeImage).
- Should we add "Open link in new tab" action for links? → Deferred to future iteration.
