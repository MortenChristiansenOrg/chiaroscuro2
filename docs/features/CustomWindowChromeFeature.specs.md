# Specification for Custom Window Chrome Feature

## Overview

The Custom Window Chrome feature provides the app’s custom title bar controls and related window actions.

It also keeps the chrome UI in sync with the active tab’s loading state, and allows copying the current address.

## Terminology

- **Window chrome**: the app’s title bar area (minimize/maximize/close and related controls).
- **Loading state**: whether the active tab is currently navigating/loading.
- **Address**: the current tab’s URL.

## Requirements

- The window must be possible to minimize and maximize/restore using the custom chrome controls.
- The chrome must display a visible loading indicator when the active tab is loading (e.g., a spinner icon in the active tab or a progress bar in the title bar) and hide it when loading finishes.
- Copying the current address must copy the active tab’s address to the clipboard.
- When copying an address, the copied value should omit common ad-tracking query parameters when present.

## Workflows

### Minimize the window

- Click the minimize control in the window chrome.
- The window becomes minimized.

### Maximize or restore the window

- Click the maximize/restore control in the window chrome.
- If the window was maximized, it returns to normal size.
- If the window was normal size, it becomes maximized.

### Copy the current address

- Use the “copy address” control in the window chrome.
- The current tab’s address is copied to the clipboard.
- If the address contains known ad-tracking query parameters, the copied address omits those parameters.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Minimize window**: Click the minimize control in the window chrome.
- **Maximize/restore window**: Click the maximize/restore control in the window chrome.
- **Copy address**: Click the copy-address control in the window chrome.
