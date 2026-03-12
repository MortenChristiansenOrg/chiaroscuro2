# Specification for SSO Feature

## Overview

Enable Single Sign-On for web content tabs using the OS primary account, equivalent to WebView2's `AllowSingleSignOnUsingOSPrimaryAccount`. Supports Windows Integrated Authentication (NTLM/Kerberos) and Azure AD (Microsoft Entra ID) SSO via Chromium command-line switches.

Requires a prerequisite refactoring: the Settings feature becomes a generic service with a section registration API, so SSO (and future features) can plug their own settings sections in without modifying the Settings feature.

## Terminology

- **Windows Auth**: NTLM/Kerberos negotiate authentication using OS credentials. Chromium flags: `--auth-server-whitelist`, `--auth-negotiate-delegate-whitelist`.
- **Azure AD SSO**: Single sign-on via Microsoft Entra ID using the Windows Cloud AP plugin. Chromium flag: `--enable-features=CloudAPAuthEnabled`.
- **Boot-time setting**: A setting that can only take effect at application startup, requiring a restart for changes to apply.
- **Settings section**: A UI section registered by a feature to appear on the settings page. Each feature owns its section's types, persistence, and rendering.

## Requirements

- Two independent boolean toggles: Windows Auth and Azure AD SSO.
- Both disabled by default.
- Server whitelist hardcoded to `*` (all servers) — no per-server configuration UI.
- Settings persisted to the data store via the SSO feature's own commands (not the Settings feature's save pipeline).
- Command-line switches applied at boot by reading `settings.json` synchronously before `app.whenReady()`.
- Settings page shows a "restart required" badge when current toggle state differs from the boot-time state.
- Windows-only feature: section hidden on non-Windows platforms.

## Workflows

### Enable SSO

1. User opens Settings (via `settings:open` command or Ctrl-,).
2. Scrolls to or searches for "Authentication" section.
3. Toggles "Windows Authentication" and/or "Azure AD" checkboxes.
4. Settings auto-save (debounced via SSO store).
5. A "restart required" badge appears next to changed toggles.
6. User restarts the app. SSO is active on next launch.

### Disable SSO

Same workflow — uncheck toggles, restart.

## Interactions

### Keyboard shortcuts

None — uses existing settings page navigation (Tab, Enter, Space for checkboxes).

### Mouse interactions

- **Checkbox toggle**: Enable/disable each SSO method independently.

### Cross-feature interactions

- **Settings feature**: SSO registers a settings section via `registerSettingsSection()`. The settings page renders it alongside other sections. SSO handles its own persistence independently.
- **Tabs feature**: No direct interaction. SSO affects HTTP auth negotiation transparently at the Chromium networking layer.

## Commands & Events

### Commands

- `sso:get` — Returns current SSO state (settings + boot state + platform). Payload: `undefined`. Response: `SsoState`.
- `sso:save` — Persist SSO settings. Payload: `SsoSettings`. Response: `undefined`.

### Events

- `sso:changed` — Emitted when SSO state changes (initial load or save). Payload: `SsoState`.

### Types

```typescript
interface SsoSettings {
  windowsAuth: boolean;
  azureAd: boolean;
}

interface SsoState {
  settings: SsoSettings;
  bootState: SsoSettings; // what was applied at startup
  isWindows: boolean;
}
```

## Unresolved Issues

- None.
