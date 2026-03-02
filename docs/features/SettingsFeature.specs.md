# Specification for Settings Feature

## Overview

The Settings feature provides a built-in settings page where you can edit global browser settings.

Settings are saved to a JSON file on disk and restored when the app starts.

## Terminology

- **Settings page**: the built-in app page used to edit settings.
- **Search provider**: a configured search engine with a bang keyword and URL template.

## Requirements

- The app must provide a built-in settings page at `/settings`.
- Saving settings must persist them.
- Persisted settings must be restored on startup.
- The settings page must allow configuring search providers (bang keywords and URL templates).
- The settings page must allow setting the default search provider.

## Workflows

### Open settings

- Navigate to `/settings` (via command palette or `settings:open` command).
- The settings page opens inside a tab.

### Save settings

- Change one or more settings on the settings page.
- Save.
- The app persists the updated settings.
- The changes take effect immediately.

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
