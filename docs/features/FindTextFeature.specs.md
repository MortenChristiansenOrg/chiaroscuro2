# Specification for Find Text Feature

## Overview

The Find Text feature provides "Find in Page" for the current tab.

It renders as a small floating widget overlaying the top-right of the current page content (similar to Chrome/Firefox find bars), using Electron's `webContents.findInPage()` API.

This feature is independent of the tab palette.

## Terminology

- **Find term**: the text currently being searched for in the page.
- **Find mode**: the state where a find term is active and next/previous navigation is enabled.
- **Find bar**: the floating overlay widget showing the search input and match navigation.

## Requirements

- Find must operate on the currently active tab's `WebContentsView`.
- Starting Find must show the find bar overlay and focus its input.
- The find bar is rendered as a React component positioned over the active tab's content area.
- While Find mode is active, the user must be able to navigate between matches and exit Find mode.
- Find mode must stop when the find bar is dismissed or the current tab is deactivated.
- Stopping Find must call `webContents.stopFindInPage('clearSelection')` to clear highlights.

## Workflows

### Start Find in Page

- Press the Find shortcut.
- The find bar appears overlaying the page content.
- The find input receives focus.
- Enter a term to start searching within the page.

### Navigate between matches

- While Find mode is active:
  - Enter or F3 moves to the next match.
  - Shift+Enter or Shift+F3 moves to the previous match.

### Stop finding

- While Find mode is active, press Escape.
- Find highlights are cleared, find bar closes, and Find mode ends.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcuts:

- **Ctrl-F**: Show find bar and focus input.
- **F3**: Show find bar and focus input (or next match if already in find mode).
- **Enter**: Navigate to the next match (while find bar is focused).
- **Shift+Enter**: Navigate to the previous match (while find bar is focused).
- **Shift+F3**: Navigate to the previous match.
- **Esc**: Close find bar and stop finding.

### Mouse interactions

- **Close find bar**: Click the close button on the find bar.
- **Next/previous**: Click next/previous buttons on the find bar.

## Commands & Events

### Commands

- `find:start` — Start find mode and show the find bar.
- `find:next` — Navigate to the next match.
- `find:previous` — Navigate to the previous match.
- `find:stop` — Stop find mode, close find bar, and clear highlights.

### Events

- `find:result` — Emitted when find results update. Payload: `{ activeMatchOrdinal: number, matches: number }`.

## Unresolved Issues

- **Match count display**: Should the find bar show the current match number and total count (e.g. "3 of 17")? (Most modern browsers do this — likely yes.)
