# Specification for Installer & Auto-Update Feature

## Overview

Packages Chiaroscuro as a Windows NSIS installer, registers it as a default browser candidate, handles external protocol launches securely, and provides automatic updates via GitHub Releases.

## Terminology

- **NSIS**: Nullsoft Scriptable Install System — Windows installer framework used by electron-builder.
- **Protocol handler**: OS-level registration that routes URLs with a specific scheme (e.g. `http://`, `https://`) to an application.
- **External protocol launch**: When web content tries to open a non-http(s) URL (e.g. `slack://`, `vscode://`), triggering an external application.
- **Auto-updater**: Background process using electron-updater to check GitHub Releases for new versions.

## Requirements

### Packaging & Installation

- Build Windows NSIS installer via electron-builder.
- No macOS or Linux targets.
- No code signing (personal use).
- Installer registers file associations for `.html`, `.htm`, `.mhtml`, `.svg`, `.pdf`.
- Installer registers protocol associations for `http`, `https`.
- App appears in Windows "Default apps" settings as a browser candidate.

### Default Browser Registration

- Windows registry entries added during NSIS install for `http`/`https` protocol handling.
- File associations (`.html`, `.htm`, etc.) registered during install.
- When launched via protocol/file association, the URL or file path opens in a new tab.

### External Protocol Handling

- When web content navigates to a non-standard protocol (e.g. `slack://open`), intercept before launching.
- Show a confirmation dialog: "Allow [origin] to open [protocol]://...?" with Allow/Deny.
- User can check "Always allow [protocol] from [origin]" to skip future prompts.
- Allowed protocol+origin pairs persisted to DataStore.
- Denied navigations are silently dropped.

### Auto-Update

- On app start (after a delay) and periodically (every 4 hours), check GitHub Releases for updates.
- Download update silently in background.
- After download completes, emit event so renderer shows "Update ready — restart to apply" notification.
- User clicks restart: app quits and installs update.
- User can dismiss notification; it reappears on next app start if update still pending.
- Manual check via command (exposed in command palette).

### Release Workflow

- GitHub Actions workflow triggers on `v*` tag push.
- Builds on Windows runner (`blacksmith-2vcpu-windows-2025`).
- Runs typecheck + lint + test before building.
- Builds NSIS installer via electron-builder.
- Uploads installer artifacts to GitHub Releases (draft).

## Workflows

### First Install

1. User downloads NSIS installer from GitHub Releases.
2. Runs installer — installs app, registers protocol/file associations.
3. App appears in Windows "Default apps" as browser option.
4. User sets Chiaroscuro as default browser in Windows Settings if desired.

### Auto-Update

1. App starts, waits 30 seconds, then checks for updates.
2. If update available, downloads silently.
3. Notification appears: "Update ready — restart to apply".
4. User clicks "Restart" — app quits, update installs, app relaunches.
5. User dismisses — notification hidden until next check/restart.

### External Protocol Launch

1. Web page navigates to `someapp://action`.
2. Chiaroscuro intercepts navigation.
3. If protocol+origin previously allowed, launch external app immediately.
4. Otherwise, show confirmation dialog.
5. User allows (optionally with "always allow") or denies.
6. If allowed, launch external app via `shell.openExternal`.

### Release

1. Developer tags commit: `git tag v1.2.3 && git push --tags`.
2. GitHub Actions builds Windows installer.
3. Artifacts uploaded to GitHub Releases as draft.
4. Developer reviews and publishes release.
5. Running instances pick up update on next check cycle.

## Interactions

### Keyboard shortcuts

None — this feature is background/config only, no keyboard shortcuts.

### Mouse interactions

- **Update notification**: Click "Restart" to apply update, or dismiss icon to hide.
- **Protocol dialog**: Click "Allow" or "Deny", optionally check "Always allow".

### Cross-feature interactions

- **Command palette**: Exposes "Check for updates" quick action.
- **Tabs**: Protocol/file association launches open new tabs via `tabs:create`.
- **App state**: Update notification visibility persisted across restarts if update pending.
- **Settings**: Could expose auto-update toggle (deferred).

## Commands & Events

### Commands

- `installer:check-for-updates` — Manually trigger update check. Payload: `undefined`.
- `installer:apply-update` — Quit and install pending update. Payload: `undefined`.
- `installer:dismiss-update` — Hide update notification until next check. Payload: `undefined`.
- `installer:allow-protocol` — Allow a protocol+origin pair. Payload: `{ protocol: string; origin: string; always: boolean }`.
- `installer:deny-protocol` — Deny a protocol launch. Payload: `{ protocol: string; origin: string }`.

### Events

- `installer:update-available` — New version found. Payload: `{ version: string }`.
- `installer:update-downloaded` — Update ready to install. Payload: `{ version: string }`.
- `installer:update-not-available` — Already on latest. Payload: `undefined`.
- `installer:update-error` — Update check/download failed. Payload: `{ message: string }`.
- `installer:protocol-launch-requested` — External protocol intercepted, needs user decision. Payload: `{ protocol: string; origin: string; url: string }`.
- `installer:update-dismissed` — User dismissed update notification. Payload: `undefined`.

## Unresolved Issues

- Should "Always allow" protocol decisions be per-workspace or global? (Starting with global.)
- Should there be a settings UI to manage allowed protocols? (Deferred.)
- Should auto-update be opt-out via settings? (Deferred — always enabled for now.)
