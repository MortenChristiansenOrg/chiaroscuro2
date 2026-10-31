# Specification for Custom Window Chrome Feature

## Overview

The Custom Window Chrome feature provides the app's custom title bar controls and related window actions. The window is created as a frameless Electron `BrowserWindow` with `titleBarStyle: 'hidden'` (or fully frameless), and the title bar is rendered as a React component within the browser chrome.

It also keeps the chrome UI in sync with the active tab's loading state, and allows copying the current address.

## Terminology

- **Window chrome**: the app's title bar area (minimize/maximize/close and related controls), rendered in React.
- **Loading state**: whether the active tab is currently navigating/loading.
- **Address**: the current tab's URL.

## Requirements

- The window must be possible to minimize and maximize/restore using the custom chrome controls.
- The window must be draggable via the title bar area (using `-webkit-app-region: drag` CSS property).
- Only the window chrome defines drag regions. Web pages in tabs must not: Electron hit-tests every view in the window, and a hidden tab sits at the window's origin, so a page's `app-region: drag` (common on sites built for desktop app shells) would cover the title bar and swallow clicks on its controls. The tab preload overrides `app-region` with a user-origin `!important` rule.
- Every title-bar control must be clickable across its whole area, icon or text included, on Windows; empty title-bar space stays draggable.
- The chrome must display a visible loading indicator when the active tab is loading (e.g., a spinner icon in the active tab or a progress bar in the title bar) and hide it when loading finishes.
- Copying the current address must copy the active tab's address to the clipboard.
- When copying an address, the copied value should omit common ad-tracking query parameters when present.
- When a page enters full screen, for example a video, the page must fill the whole screen with no window chrome, sidebar or sub-tab frame in view. This also applies to pages in sub-tabs.
- When a page leaves full screen, the window must return to the state it had before, maximized or normal, in one step. Switching away from the page, closing it or opening a sub-tab from it also leaves full screen.
- A window is never restored in page full screen after a restart. Pressing restore on a window that is in full screen for another reason returns it to its earlier state in one press.

## Workflows

### Minimize the window

- Click the minimize control in the window chrome.
- The window becomes minimized.

### Maximize or restore the window

- Click the maximize/restore control in the window chrome.
- If the window was maximized, it returns to normal size.
- If the window was normal size, it becomes maximized.

### Watch a video in full screen

- Use the page's own full screen control, for example on a video.
- The page fills the screen and covers the taskbar.
- Press Escape or the page's control to leave. The window and its chrome return as they were.

### Copy the current address

- Use the "copy address" control in the window chrome.
- The current tab's address is copied to the clipboard.
- If the address contains known ad-tracking query parameters, the copied address omits those parameters.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Minimize window**: Click the minimize control in the window chrome.
- **Maximize/restore window**: Click the maximize/restore control in the window chrome.
- **Copy address**: Click the copy-address control in the window chrome.
- **Drag window**: Drag the title bar area to move the window.
- **Double-click title bar**: Toggle maximize/restore (platform convention).

## Commands & Events

### Commands

- `window:minimize` — Minimize the window.
- `window:maximize-restore` — Toggle maximize/restore.
- `window:close` — Close the window. Pages with unsaved changes ask first (see [Tabs](TabsFeature.specs.md#quit-or-close-the-browser-window)).
- `window:copy-address` — Copy the active tab's address to clipboard (with tracking parameter stripping).

### Events

- `window:maximized-changed` — Window maximized state changed. Payload: `{ maximized: boolean }`.
- `tab:loading-changed` — Active tab loading state changed. Payload: `{ tabId: string, loading: boolean }`.

## Resolved Decisions

- **Platform-specific title bar**: macOS uses native traffic lights via `titleBarStyle: 'hidden'`. Custom minimize/maximize/close buttons rendered only on Windows/Linux, right-aligned.
- **Close button**: Included alongside minimize and maximize/restore.

## Unresolved Issues

- **Tracking parameter list**: The list of ad-tracking query parameters to strip needs to be defined and maintained. Consider using a community-maintained list or making it configurable.
