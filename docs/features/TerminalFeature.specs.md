# Specification for Terminal Feature

## Overview

Provides a slide-out terminal that allows you to interact with and get output from processes and tools running for the active tab. The terminal is a feature meant to serve other features by showing their output and exposing their commands.

## Terminology

- **Terminal overlay**: The slide-out panel displaying process output
- **Terminal buffer**: Per-tab scrollback history of process output

## Requirements

- Terminal must toggle visibility via keyboard shortcut
- Each tab must have its own isolated terminal buffer
- Terminal must support displaying standard and error output
- Terminal must display output sent by backend features through the terminal output command
- Error output must be displayed in red
- Terminal buffers must persist while tab exists (scrollback: 5000 lines)
- Terminal must auto-fit to available space when resized
- User must be able to clear the terminal buffer

## Workflows

### Viewing Process Output

1. User presses toggle key to open terminal
2. Terminal shows output for current tab
3. Switching tabs switches to that tab's terminal buffer
4. User presses toggle key to close terminal

### Clearing Terminal

1. User types `/clear` in command input and presses Enter
2. Current tab's terminal buffer is cleared

## Interactions

### Terminal UI

- Terminal display: read-only with transparent background
- Command input: text field at bottom for commands (currently only `/clear`)
- Output styling: normal text in slate-400, errors in red

### Keyboard shortcuts

- `½`: Toggle terminal visibility

### Mouse interactions

- Select text in terminal to copy
- Click command input to type commands
