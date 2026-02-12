# Specification for Action Dialog Feature

## Overview

The Action Dialog feature provides a single command box for navigating, searching, and opening built-in pages.

It supports:

- entering a URL to navigate to it,
- entering a search query (with optional provider selection), and
- opening “content pages” (for example `/settings`) that are handled by the app.

## Terminology

- **Action dialog**: the command input UI.
- **Command**: the text entered into the action dialog.
- **Search provider**: a keyword that routes a query to a specific service (for example `!gh`).
- **Content page**: an app-defined page address like `/settings`.

## Requirements

- The action dialog must be possible to show/close via keyboard.
- Executing a command must navigate either in a new tab or the current tab.
- Search provider syntax must support provider keys at either the start or end of the command.
- If the command is a content page address (like `/settings`), it must open the corresponding app page.
- The dialog must show suggestions based on navigation history as the user types.

## Workflows

### Show the action dialog

- Press the action dialog shortcut.
- The dialog becomes visible.

### Execute a command

- Type a command and press Enter.
- The command is interpreted in this order:
  1. If the command contains an explicit search provider (e.g. `!g cats` or `cats !g`), perform a provider search.
  2. If the command is a content page (e.g. `/settings`), open that page.
  3. If the command looks like a search (contains spaces, or does not contain a `.`), search using the default provider.
  4. Otherwise, navigate to the command as an address.

### Execute in current tab

- While the dialog is open, use the “current tab” modifier when executing.
- Navigation happens in the current tab instead of creating a new one.

### Use suggestions

- As you type, the dialog updates suggestions based on navigation history.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcuts:

- **Ctrl-T**: Show action dialog.

In action dialog:

- **Enter**: Navigate to page in new tab.
- **Ctrl-Enter**: Navigate to page in current tab.

### Mouse interactions

- None.
