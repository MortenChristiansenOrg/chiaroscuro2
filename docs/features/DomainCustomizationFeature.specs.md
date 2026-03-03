# Specification for Domain Customization Feature

## Overview

The Domain Customization feature lets users apply per-domain custom CSS in tabs. Users inject a user-managed CSS file into pages on a domain using Electron's `webContents.insertCSS()` and `webContents.removeInsertedCSS()` APIs.

Accessed via an icon button in the address bar (left of the URL). Clicking opens a singleton built-in tab for that domain showing CSS toggle, edit, and remove controls using the shared SettingsLayout scaffold.

## Terminology

- **Domain**: the hostname extracted from the active tab's URL.
- **Domain CSS**: a CSS file stored per domain on disk.
- **CSS enabled**: whether custom CSS injection is active for a given domain.

## Requirements

- Domain customization state (enabled/disabled per domain) persisted across app runs via DataStore.
- CSS files stored in a `domain-css/` subdirectory of the app's user data directory.
- If CSS is enabled and a CSS file exists, inject it via `webContents.insertCSS()`.
- If CSS is disabled or no file exists, remove any injected CSS via `webContents.removeInsertedCSS()`.
- When switching tabs or navigating to a different domain, update injected CSS accordingly.
- File watching via `fs.watch()` re-injects CSS on file changes while enabled.
- If the CSS file is deleted while enabled, auto-disable CSS for that domain.
- The domain customization tab is a built-in page (`app:domain-css?domain=<host>`), singleton per domain.
- The icon button in the address bar only appears for web tabs (not built-in tabs).
- CSS re-applied on `did-finish-load` to survive in-page navigations.

## Workflows

### Open domain customization

- Click the customization icon button in the address bar (left of URL).
- A built-in tab opens for the current domain (or reactivates if already open).
- The tab shows the domain name and CSS controls.

### Enable/disable CSS

- In the domain customization tab, toggle the "CSS enabled" switch.
- When enabled: inject CSS file contents (if file exists) into all tabs on that domain.
- When disabled: remove injected CSS from all tabs on that domain.

### Edit CSS file

- Click "Edit CSS" in the domain customization tab.
- If no CSS file exists, create an empty one.
- Auto-enable CSS for the domain.
- Open the file in the system's default text editor via `shell.openPath()`.
- File changes detected via `fs.watch()` and re-injected automatically.

### Remove CSS file

- Click "Remove CSS" in the domain customization tab.
- Delete the CSS file from disk.
- Stop file watching, remove injected CSS, disable CSS for that domain.

## Interactions

### Keyboard shortcuts

- None.

### Mouse interactions

- **Address bar icon button**: opens the domain customization tab for the active tab's domain.

### Cross-feature interactions

- **Tabs**: listens for tab activation/navigation events to inject/remove CSS. Uses `tabs:create` / `tabs:activate` for built-in tab management.
- **Window Chrome**: icon button rendered inside UrlPill component.
- **Settings**: shares SettingsLayout scaffold components (SettingItem, section headings, input styles).

## Commands & Events

### Commands

- `domain-css:open` — Open domain customization tab for a domain. Payload: `{ domain: string }`.
- `domain-css:toggle` — Toggle CSS injection for a domain. Payload: `{ domain: string }`.
- `domain-css:edit` — Create CSS file if needed, enable CSS, open in system editor. Payload: `{ domain: string }`.
- `domain-css:remove` — Remove the CSS file for a domain. Payload: `{ domain: string }`.
- `domain-css:get-state` — Get current CSS state for a domain. Payload: `{ domain: string }`. Response: `{ domain: string, enabled: boolean, hasFile: boolean }`.

### Events

- `domain-css:changed` — CSS state changed for a domain. Payload: `{ domain: string, enabled: boolean, hasFile: boolean }`.

## Unresolved Issues

- **CSS injection on navigation**: Need to verify `did-finish-load` is sufficient for re-injection after SPA navigations and redirects.
- **Multiple tabs same domain**: When toggling CSS, should injection update all open tabs on that domain or just the active one?
