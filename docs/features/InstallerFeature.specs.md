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

### Release channels and isolation

Channel metadata lives in `src/shared/app-channel.ts`. Packaging consumes it via
`scripts/release-config.ts`; startup selects the packaged `releaseChannel` before
acquiring the single-instance lock or creating Chromium sessions.

| Channel | Product / executable | Profile | Icon | Updates |
| --- | --- | --- | --- | --- |
| Stable | Chiaroscuro | Existing Electron profile (preserved) | White C on black | `latest.yml`, stable only |
| Early Access | Chiaroscuro Early Access | `%APPDATA%/chiaroscuro-early-access` | White C on amber | `beta.yml`, beta only |
| Dev | Chiaroscuro Dev | `%APPDATA%/chiaroscuro-dev` | White C on blue | Disabled |

- Stable retains `com.chiaroscuro.browser`; the other AppUserModelIDs append
  `.early-access` and `.dev`. Installed executable names, default directories,
  shortcuts, uninstall entries, browser registrations and updater caches differ.
- Early Access uses its own fixed default installation directory. Installers reject
  an installation directory marked as another edition. Process matching uses the
  exact executable name, so a stable update cannot close Early Access by matching
  the beginning of its installation path.
- Chromium `userData` and `sessionData` are set together before the lock. Application
  data is stored underneath the selected profile. No automatic profile import or
  migration occurs. Uninstall preserves the edition's profile.
- All unpackaged launches use Dev, including built local-file launches. Automated
  tests use Dev branding and their temporary profile. Neither runs the updater.
  Packaged editions ignore `DATA_DIR` overrides outside automation.
- Both installed editions register their own ProgIDs and Open With candidates,
  without overwriting file or protocol defaults. Uninstall removes only the
  edition's own registrations.
- Variant assets provide a 512px PNG and a Windows ICO with 16, 24, 32, 48, 64,
  128 and 256px representations. Stable assets remain unchanged.

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
- Stable explicitly disallows prereleases and checks the manifest version's channel
  before accepting an update, including a beta incorrectly marked stable on GitHub.
- Early Access selects the highest published `vX.Y.Z-beta.N` GitHub prerelease using
  numeric version ordering, then reads that release's `beta.yml`. Drafts, stable,
  alpha and RC releases are ignored. The manifest is also checked before download.
  Lookup errors (including GitHub rate limits) fail the check without falling back
  to stable. The unauthenticated API lookup has a 15-second timeout per page and
  a ten-page bound. A check typically makes one API request.
- Channel selection never permits a version downgrade.

### Release Workflow

- Stable `vX.Y.Z` tag pushes publish automatically. Tags containing `-` are excluded
  from the push trigger. Early Access requires an explicit manual workflow run.
- Builds on Windows runner (`blacksmith-2vcpu-windows-2025`).
- Runs typecheck + lint + test before building.
- Builds NSIS installer via electron-builder.
- Uploads installer artifacts to GitHub Releases.
- Validates exact tags for both entry points; unsupported suffixes, leading zeroes,
  build metadata and trailing text are rejected. The tag must already exist.
- Marks Early Access releases `prerelease: true` and `make_latest: false`.
- Each release includes only its own updater manifest and installer/blockmap.

## Workflows

### First Install

1. User downloads NSIS installer from GitHub Releases.
2. Runs installer — installs app, registers protocol/file associations.
3. App appears in Windows "Default apps" as browser option.
4. User sets Chiaroscuro as default browser in Windows Settings if desired.

### Auto-Update

1. App starts, waits 3 seconds, then checks for updates in its channel.
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

1. Developer tags commit: `git tag v1.2.3 && git push origin v1.2.3`.
2. GitHub Actions builds Windows installer.
3. Artifacts uploaded to GitHub Releases.
4. Running instances pick up update on next check cycle.

### Publish Early Access on demand

1. Tag the desired commit: `git tag v1.2.3-beta.1`.
2. Push that tag: `git push origin v1.2.3-beta.1` (this does not publish).
3. Open Actions → Release → Run workflow and enter `v1.2.3-beta.1`, or run
   `gh workflow run release.yml -f tag=v1.2.3-beta.1`.
4. Download `Chiaroscuro-Early-Access-Setup-1.2.3-beta.1.exe` from the prerelease
   and install it alongside stable. Subsequent published betas update this edition.

For a local installer without publishing, run `bun run build` followed by
`bun run package:win v1.2.3-beta.1` on Windows. Outputs are in `dist/early-access/`
(`dist/stable/` for a stable tag). Packaging stamps the version in the packaged
metadata; it does not modify the checkout's `package.json` or create/push a tag.
The base `electron-builder.yml` rejects direct packaging without a release channel.

### Verification

Unit tests cover tag validation, profile selection, package metadata, icon sizes,
numeric beta selection/pagination and update rejection. PR CI builds both NSIS
editions and a second beta on a disposable Windows runner, installs them together,
runs them alongside Dev, checks distinct profiles/cookies and registry entries,
upgrades/reinstalls Early Access, and verifies both uninstall directions preserve
the other editions. `e2e/packaging/installed-channels.ts` refuses to run outside
GitHub Actions on Windows so it cannot alter a developer's installations.

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
