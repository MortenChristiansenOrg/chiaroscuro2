# Specification for Settings Feature

## Overview

The Settings feature provides a built-in settings page where you can edit global browser settings.

Settings are saved to a JSON file on disk and restored when the app starts.

## Terminology

- **Settings page**: the built-in app page used to edit settings.
- **User agent**: the identification string sent to websites.
- **Search provider**: a configured search engine with a bang keyword and URL template.

## Requirements

- The app must provide a built-in settings page at `/settings`.
- Saving settings must persist them to a JSON file on disk.
- Settings saved on disk must be restored on startup.
- The settings page must allow editing the user agent string.
- The settings page must allow configuring search providers (bang keywords and URL templates).
- The settings page must allow setting the default search provider.
- The settings page must allow configuring keyboard shortcuts.

## Workflows

### Open settings

- Navigate to `/settings` (via command palette or `settings:open` command).
- The settings page opens inside a tab.

### Save settings

- Change one or more settings on the settings page.
- Save.
- The app persists the updated settings.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Edit settings**: Use the settings page controls to update values.
- **Save**: Use the settings page save action.

## Commands & Events

### Commands

- `settings:open` — Open the settings page in a tab.
- `settings:save` — Save current settings to disk.
- `settings:get` — Retrieve current settings.

### Events

- `settings:changed` — Settings were updated. Payload: `{ changes: Partial<Settings> }`.

## Unresolved Issues

- **SSO domains removed**: The old spec had SSO domain configuration, which was specific to CefSharp's authentication handling. Electron handles authentication differently (via `app.on('login')` event). Decide if any SSO/auth domain configuration is needed.
- **GPU compositing removed**: The old spec had a GPU compositing toggle. Electron manages GPU acceleration via command-line flags (`--disable-gpu`, etc.) and `app.disableHardwareAcceleration()`. Decide if this should be exposed as a setting or handled automatically.
- **Settings schema**: The full settings schema needs to be defined. At minimum: user agent, search providers, default search provider, keyboard shortcuts, ephemeral tab TTL.
- **Settings validation**: Settings loaded from disk should be validated (e.g., with Zod) to handle corruption or schema changes between versions.
- **Live reload**: Should settings changes take effect immediately or require an app restart?
