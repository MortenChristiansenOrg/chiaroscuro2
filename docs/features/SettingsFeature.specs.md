# Specification for Settings Feature

## Overview

The Settings feature provides a built-in settings page where you can edit global browser settings.

Settings are saved to disk and restored when the app starts.

## Terminology

- **Settings page**: the built-in app page used to edit settings.
- **SSO domain**: a domain where sign-in should use the app’s SSO-capable mode.
- **User agent**: the identification string sent to websites.
- **GPU compositing**: an experimental rendering mode that may improve performance but can reduce stability on some systems.

## Requirements

- The app must provide a settings page at the content-page address `/settings`.
- Saving settings must persist them to disk.
- Settings saved on disk must be restored on startup.
- The settings page must allow editing the user agent string.
- The settings page must allow enabling/disabling experimental GPU compositing.
- The settings page must allow editing SSO-enabled domains.
- If “auto-add SSO domains” is enabled, starting an SSO flow for a domain that is not yet enabled should add that domain to the enabled list.

## Workflows

### Open settings

- Navigate to `/settings`.
- The settings page opens inside a tab.

### Save settings

- Change one or more settings on the settings page.
- Save.
- The app persists the updated settings.

### Auto-add SSO domain during sign-in

- Enable “auto-add SSO domains” in settings.
- Start an SSO/sign-in flow for a domain that is not yet in the enabled list.
- The app adds the domain to the SSO-enabled domains list.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Edit settings**: Use the settings page controls to update values.
- **Save**: Use the settings page save action.
