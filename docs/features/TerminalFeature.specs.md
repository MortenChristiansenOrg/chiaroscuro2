# Specification for Terminal Feature

## Overview

Provides a slide-out terminal overlay that allows you to view output from processes and tools running for the active tab. The terminal is a feature meant to serve other features (like Local Web App) by showing their output.

## Terminology

- **Terminal overlay**: The slide-out panel displaying process output.
- **Terminal buffer**: Per-tab scrollback history of process output.

## Requirements

- Terminal must toggle visibility via keyboard shortcut.
- Each tab must have its own isolated terminal buffer.
- Terminal must support displaying standard and error output.
- Terminal must display output sent by other features through the terminal output event/command.
- Error output must be displayed in red.
- Terminal buffers must persist while tab exists (scrollback: 5000 lines).
- Terminal must auto-fit to available space when resized.
- User must be able to clear the terminal buffer.
- Terminal is rendered as a React component in the browser chrome renderer.

## Workflows

### Viewing Process Output

1. User presses toggle key to open terminal.
2. Terminal shows output for current tab.
3. Switching tabs switches to that tab's terminal buffer.
4. User presses toggle key to close terminal.

### Clearing Terminal

1. User types `/clear` in command input and presses Enter.
2. Current tab's terminal buffer is cleared.

## Interactions

### Terminal UI

- Terminal display: read-only scrollable area with monospace font.
- Command input: text field at bottom for commands (currently only `/clear`).
- Output styling: normal text in muted color, errors in red.

### Keyboard shortcuts

- **Backtick (`` ` ``)**: Toggle terminal visibility.

### Mouse interactions

- Select text in terminal to copy.
- Click command input to type commands.

## Commands & Events

### Commands

- `terminal:toggle` — Toggle terminal visibility.
- `terminal:clear` — Clear the current tab's terminal buffer.
- `terminal:write` — Write output to a tab's terminal. Payload: `{ tabId: string, data: string, type: 'stdout' | 'stderr' }`.

### Events

- `terminal:visibility-changed` — Terminal visibility changed. Payload: `{ visible: boolean }`.

## Unresolved Issues

- **Toggle shortcut**: The old spec used `½` (section sign key on Scandinavian keyboards). Changed to backtick (`` ` ``) which is more universally accessible, similar to game console toggles and VS Code terminal. Confirm this is acceptable.
- **Terminal emulator library**: Should this use a terminal emulator library like xterm.js for proper ANSI escape code rendering, or is a simple scrollable div with text sufficient?
- **Interactive commands**: The spec only supports `/clear` as a command. Should the terminal support running arbitrary shell commands in the future, or is it strictly an output viewer?
- **Terminal per tab vs global**: Each tab has its own buffer, but should there also be a global terminal for app-level output?
