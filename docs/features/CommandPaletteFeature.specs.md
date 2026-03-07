# Specification for Command Palette Feature

## Overview

The Command Palette feature provides a single command box for navigating, searching, executing actions, and opening built-in pages.

It supports:

- entering a URL to navigate to it,
- entering a search query with optional bang syntax for provider selection (e.g. `!g query`, `!gh query`),
- searching open tabs, history, and bookmarks,
- executing quick actions (new tab, close tab, settings, etc.), and
- opening built-in pages (e.g. `/settings`).

This is the primary navigation interface — there is no persistent address bar.

## Terminology

- **Command palette**: the command input UI (Arc-style, invoked via T).
- **Command**: the text entered into the command palette.
- **Search provider**: a bang keyword that routes a query to a specific service (e.g. `!g` for Google, `!gh` for GitHub).
- **Built-in page**: an app-defined page like `/settings`.

## Requirements

- The command palette must be possible to show/close via keyboard.
- Executing a command must navigate either in a new tab or the current tab.
- Search provider syntax must support bang keys at either the start or end of the command (e.g. `!g cats` or `cats !g`).
- If the command is a built-in page path (like `/settings`), it must open the corresponding app page.
- The palette must show suggestions based on navigation history and open tabs as the user types.
- Search providers must be configurable in settings.
- The default search provider (no bang) must be configurable, defaulting to Google.

## Workflows

### Show the command palette

- Press the command palette shortcut.
- The palette becomes visible with the input focused.

### Execute a command

- Type a command and press Enter.
- The command is interpreted in this order:
  1. If the command contains an explicit search provider bang (e.g. `!g cats` or `cats !g`), perform a provider search.
  2. If the command is a built-in page path (e.g. `/settings`), open that page.
  3. If the command looks like a search (contains spaces, or does not contain a `.`), search using the default provider.
  4. Otherwise, navigate to the command as a URL.

### Execute in current tab

- While the palette is open, use the "current tab" modifier when executing.
- Navigation happens in the current tab instead of creating a new one.

### Use suggestions

- As you type, the palette updates suggestions from:
  - Open tabs (switch to tab)
  - Navigation history
  - Bookmarked tabs
  - Quick actions

## Interactions

### Keyboard shortcuts

This feature uses the following shortcuts:

- **Ctrl-T**: Show command palette.

In command palette:

- **Enter**: Navigate to page in new tab.
- **Ctrl-Enter**: Navigate to page in current tab.
- **Escape**: Close command palette.
- **Arrow Up/Down**: Navigate suggestions.

### Mouse interactions

- Click a suggestion to execute it.

## Commands & Events

### Commands

- `command-palette:show` — Show the command palette.
- `command-palette:hide` — Hide the command palette.
- `command-palette:execute` — Execute a command. Payload: `{ command: string, inCurrentTab?: boolean }`.

### Events

- `command-palette:shown` — The command palette was opened.
- `command-palette:hidden` — The command palette was closed.

## Unresolved Issues

- **Suggestion ranking**: How should suggestions be ranked? By recency, frequency, or a combined score? Need to define the ranking algorithm.
- **Quick actions**: The spec mentions quick actions but doesn't enumerate them. Need to define the initial set of actions available in the palette.
