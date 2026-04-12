# Specification for Extensions Feature

## Overview

Adds initial Chrome extension support to Chiaroscuro. Users can search the Chrome Web Store, install extensions, and manage them (enable/disable/uninstall) from a dedicated `app:extensions` built-in page. Extensions are loaded into the shared Electron session and apply to all tabs. The target use case is productivity extensions like password managers.

## Terminology

- **Extension**: A Chrome extension (Manifest V2 or V3) loaded via Electron's `session.loadExtension()` API.
- **CRX**: Chrome extension package format — a ZIP file with a binary header.
- **Chrome Web Store (CWS)**: Google's extension marketplace at `chromewebstore.google.com`.
- **Extension ID**: A 32-character lowercase string identifying a Chrome extension.

## Requirements

- Users can open an extensions management page via command.
- The page displays a list of installed extensions with their name, version, icon, and enabled status.
- Users can search the Chrome Web Store by keyword from within the extensions page.
- Search results display extension name, icon, short description, and an install button.
- Users can install an extension from search results. The extension is downloaded, extracted, and loaded into the session.
- Users can enable or disable an installed extension (toggle).
- Users can uninstall an installed extension (removes from disk and session).
- Users cannot load local/unpacked extensions from a folder.
- Extension state (installed extensions and their enabled/disabled status) persists across app restarts.
- Extensions load into the shared default session, affecting all tabs.
- Installation shows a progress indicator (downloading/installing states).

## Workflows

### Search and Install Extension

1. User opens the extensions page (command palette or keyboard shortcut).
2. User types a search query in the search field.
3. Results from Chrome Web Store appear below.
4. User clicks "Install" on a result.
5. Extension downloads and installs. Status shows "Installing..." then "Installed".
6. Extension appears in the installed extensions list.

### Enable/Disable Extension

1. User opens the extensions page.
2. User toggles the enable/disable switch on an installed extension.
3. Extension is loaded/unloaded from the session immediately.
4. State persists across restarts.

### Uninstall Extension

1. User opens the extensions page.
2. User clicks the uninstall button on an installed extension.
3. Extension is unloaded from session and removed from disk.
4. Extension disappears from the installed list.

## Interactions

### Keyboard shortcuts

- None (opened via command palette: "Open Extensions").

### Mouse interactions

- **Click Install**: Downloads and installs extension from CWS search result.
- **Toggle switch**: Enables or disables installed extension.
- **Click Uninstall**: Removes extension after confirmation.

### Cross-feature interactions

- **tabs**: Opens the `app:extensions` built-in page as a singleton tab.
- **command-palette**: Registers "Open Extensions" command for discoverability.

## Commands & Events

### Commands

- `extensions:open` — Open the extensions management page. Payload: `undefined`.
- `extensions:search` — Search Chrome Web Store. Payload: `{ query: string }`. Response: search results array.
- `extensions:install` — Install extension by CWS ID. Payload: `{ extensionId: string; name: string }`.
- `extensions:uninstall` — Uninstall extension. Payload: `{ extensionId: string }`.
- `extensions:set-enabled` — Enable or disable extension. Payload: `{ extensionId: string; enabled: boolean }`.

### Events

- `extensions:changed` — Emitted when the installed extensions list changes (install/uninstall/enable/disable). Payload: `{ extensions: InstalledExtension[] }`.
- `extensions:install-started` — Emitted when download begins. Payload: `{ extensionId: string }`.
- `extensions:install-completed` — Emitted when install succeeds. Payload: `{ extensionId: string }`.
- `extensions:install-failed` — Emitted when install fails. Payload: `{ extensionId: string; error: string }`.
- `extensions:search-results` — Emitted with search results. Payload: `{ query: string; results: CWSSearchResult[] }`.

## Unresolved Issues

- Chrome Web Store has no official search API. The implementation uses an unofficial approach (fetching and parsing CWS pages) which may break if Google changes their frontend.
- Electron's Chrome extension support covers ~30-40% of Chrome APIs. Some extensions may not work correctly.
- No extension permissions review UI — extensions are installed with all requested permissions.
