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

## AI connection and defaults

- The AI section uses Sign in with ChatGPT with `chatgpt.tokens.use.direct` plan permission. Identity alone does not enable inference.
- Main owns PKCE OAuth, verified ID tokens, encrypted local credentials, rotating refresh tokens, and public Responses API requests (`store: false`, `stream: true`). OS-backed keyring storage is required; plaintext fallback is rejected.
- Show connected account, reconnect, sign out, cancel sign-in, and Manage usage.
- Discover models with the signed-in account's current `/v1/models` catalog. Populate supported reasoning efforts from catalog metadata or documented GPT-6 support; unknown effort support is unavailable.
- Global model/effort defaults are `gpt-6-luna` / `high`, persisted independently from credentials. Unavailable choices remain visible and require a supported user selection.
- Authentication, plan permission, usage limits, temporary service errors, and incomplete streams have recovery guidance; generated drafts and current customizations survive failure.

Official protocol: https://developers.openai.com/siwc/token-sharing-open-source/sign-in and https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.
