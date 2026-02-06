# Specification for Domain Customization Feature

## Overview

The Domain Customization feature lets you apply per-domain custom CSS in tabs.

This is used to tweak how specific sites look by injecting a user-managed CSS file into pages on that domain, using Electron's `webContents.insertCSS()` and `webContents.removeInsertedCSS()` APIs.

It is surfaced through the tab palette UI.

## Terminology

- **Domain**: the current tab's domain (host name).
- **Domain CSS**: a CSS file associated with a domain.
- **CSS enabled**: whether custom CSS injection is active for the current domain.

## Requirements

- Domain customization must be stored per domain and persisted across app runs.
- If CSS is enabled and a CSS file exists for the current domain, the CSS must be injected into the active tab via `webContents.insertCSS()`.
- If CSS is disabled (or there is no CSS file), any previously injected CSS must be removed via `webContents.removeInsertedCSS()`.
- When switching tabs or navigating to a different domain, the applied CSS must update accordingly.
- If the domain CSS file is edited while the app is running, the changes must be applied to the current tab. File watching is handled by the main process using Node.js `fs.watch()`.
- If the domain CSS file is deleted while CSS is enabled, CSS must be disabled for that domain.

## Workflows

### Enable/disable CSS for the current domain

- Open the tab palette.
- Toggle the "CSS enabled" setting for the current domain.
- When enabled, the app injects the domain CSS (if present) into the page.
- When disabled, the app removes the injected CSS.

### Create/edit the CSS file

- Open the tab palette.
- Choose to edit the domain CSS.
- The app ensures a CSS file exists for the domain and opens it in the system's default editor.
- The app automatically enables CSS for the domain.
- Changes to the file are applied as you edit (via file watching).

### Remove the CSS file

- Remove the custom CSS file for a domain (either from the UI or by deleting it on disk).
- The app stops watching the file, removes injected CSS, and disables CSS for that domain.

## Interactions

### Keyboard shortcuts

- None.

### Mouse interactions

- None (this feature is driven by UI controls inside the tab palette).

## Commands & Events

### Commands

- `domain-css:toggle` — Toggle CSS injection for the current domain.
- `domain-css:edit` — Open the CSS file for the current domain in the system editor.
- `domain-css:remove` — Remove the CSS file for the current domain.

### Events

- `domain-css:changed` — CSS state changed for a domain. Payload: `{ domain: string, enabled: boolean }`.
- `domain-css:file-updated` — A domain CSS file was modified on disk. Payload: `{ domain: string }`.

## Unresolved Issues

- **CSS file storage location**: Where should domain CSS files be stored? A subdirectory of the app's user data directory (e.g. `~/.config/chiaroscuro/domain-css/`)? This needs to be defined.
- **Editor integration**: "Opens it in the editor" — the old version may have had a built-in editor. In Electron, the simplest approach is to open the file in the system's default text editor via `shell.openPath()`. Is this sufficient?
- **CSS injection on navigation**: When a tab navigates to a new page on the same domain, `insertCSS` may need to be re-applied after the new page loads. Need to verify behavior with Electron's `did-finish-load` or `dom-ready` events.
