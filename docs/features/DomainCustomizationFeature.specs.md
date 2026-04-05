# Specification for Domain Customization Feature

## Overview

The Domain Customization feature provides per-domain settings including custom CSS injection and navigation blocking. Users can inject a user-managed CSS file into pages on a domain using Electron's `webContents.insertCSS()` and `webContents.removeInsertedCSS()` APIs, and control navigation behavior for all tabs on a domain.

Accessed via an icon button in the address bar (left of the URL). Clicking opens a singleton built-in tab for that domain showing navigation, CSS, and permission controls using the shared SettingsLayout scaffold.

## Terminology

- **Domain**: the hostname extracted from the active tab's URL.
- **Domain CSS**: a CSS file stored per domain on disk.
- **CSS enabled**: whether custom CSS injection is active for a given domain.
- **Navigation blocking**: per-domain rules that prevent pages from navigating away, redirecting, opening new tabs/windows, or allowing iframe navigation.

## Requirements

### Custom CSS

- Domain customization state (enabled/disabled per domain) persisted across app runs via DataStore.
- CSS files stored in a `domain-css/` subdirectory of the app's user data directory.
- If CSS is enabled and a CSS file exists, inject it via `webContents.insertCSS()`.
- If CSS is disabled or no file exists, remove any injected CSS via `webContents.removeInsertedCSS()`.
- When switching tabs or navigating to a different domain, update injected CSS accordingly.
- File watching via `fs.watch()` re-injects CSS on file changes while enabled.
- If the CSS file is deleted while enabled, auto-disable CSS for that domain.
- The domain customization tab is a built-in page (`app:domain-settings?domain=<host>`), singleton per domain.
- The icon button in the address bar only appears for web tabs (not built-in tabs).
- CSS re-applied on `did-finish-load` to survive in-page navigations.

### Navigation Blocking

- Per-domain navigation blocking rules persisted across app runs via DataStore.
- Five navigation blocking controls per domain:
  - **Block page navigation**: prevents `will-navigate` events (JavaScript/link navigation). Supports cross-origin-only mode.
  - **Block redirects**: prevents `will-redirect` events (server-side redirects). Supports cross-origin-only mode.
  - **Block frame navigation**: prevents `will-frame-navigate` events (iframe navigation). Supports cross-origin-only mode.
  - **Block new tabs**: prevents pages from opening new tabs (e.g. `target="_blank"` links).
  - **Block new windows**: prevents pages from opening new windows (e.g. `window.open`).
- Navigation blocking applies to all tabs on the domain based on the current URL's hostname.
- When all navigation rules are default (all disabled), the domain entry is removed from storage.

## Workflows

### Open domain customization

- Click the customization icon button in the address bar (left of URL).
- A built-in tab opens for the current domain (or reactivates if already open).
- The tab shows the domain name, navigation controls, CSS controls, and permission controls.

### Configure navigation blocking

- In the domain settings tab, toggle navigation blocking rules under the "Navigation" section.
- Each rule (navigate, redirect, frame navigate) has an enable/disable toggle and an optional cross-origin-only toggle.
- New tabs and new windows blocking are simple on/off toggles.
- Changes take effect immediately for all tabs on that domain.

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
- **Platform**: registers `onNavigationBlock` callback to intercept navigation events and check domain-level blocking rules.

## Commands & Events

### Commands

- `domain-settings:open` �� Open domain settings tab for a domain. Payload: `{ domain: string }`.
- `domain-css:toggle` — Toggle CSS injection for a domain. Payload: `{ domain: string }`.
- `domain-css:edit` — Create CSS file if needed, enable CSS, open in system editor. Payload: `{ domain: string }`.
- `domain-css:remove` — Remove the CSS file for a domain. Payload: `{ domain: string }`.
- `domain-css:get-state` — Get current CSS state for a domain. Payload: `{ domain: string }`. Response: `{ domain: string, enabled: boolean, hasFile: boolean }`.
- `domain-navigation:set` — Set navigation blocking rules for a domain. Payload: `{ domain: string, blockNavigate, blockRedirect, blockFrameNavigate, blockNewTabs, blockNewWindows }`.
- `domain-navigation:get-state` — Get current navigation blocking state for a domain. Payload: `{ domain: string }`. Response: `DomainNavigationState`.

### Events

- `domain-css:changed` — CSS state changed for a domain. Payload: `{ domain: string, enabled: boolean, hasFile: boolean }`.
- `domain-navigation:changed` — Navigation blocking state changed for a domain. Payload: `DomainNavigationState`.

## Unresolved Issues

- **CSS injection on navigation**: Need to verify `did-finish-load` is sufficient for re-injection after SPA navigations and redirects.
