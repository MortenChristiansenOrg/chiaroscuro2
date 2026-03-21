# Specification for External Link Feature

## Overview

Handles URLs and file paths received from the operating system — e.g. when Chiaroscuro is the default browser and the user clicks a link in another app, or opens an `.html`/`.pdf` file from Explorer. Ensures only one app instance runs (single-instance lock) and forwards incoming URLs to the existing window as new tabs.

## Terminology

- **External URL**: An `http://` or `https://` URL passed to the app by the OS (via protocol association or command-line argument).
- **External file**: A local file (`.html`, `.htm`, `.mhtml`, `.svg`, `.pdf`) opened via OS file association, passed as a file path argument.
- **Single-instance lock**: Electron's `requestSingleInstanceLock` — ensures only one app instance runs. Second launches forward their arguments to the first instance and exit.

## Requirements

- The app must acquire a single-instance lock on startup. If the lock cannot be acquired, the second instance must forward its argv to the running instance and quit immediately.
- When an external URL or file path is received (via `second-instance` on Windows/Linux, `open-url` / `open-file` on macOS, or initial launch argv), a new ephemeral tab must be created with that URL.
- File paths must be converted to `file://` URLs before creating the tab.
- The existing app window must be focused when an external URL is received.
- URLs must be validated: only `http:`, `https:`, and `file:` schemes are accepted. All others are silently ignored.
- Multiple URLs in a single argv are each opened in their own tab.
- No confirmation dialog — external URLs open silently (the OS already expressed user intent).

## Workflows

### User clicks link in another app (default browser)

1. User clicks an `https://example.com` link in e.g. Slack, email client.
2. OS launches Chiaroscuro with the URL as a command-line argument.
3. Second instance detects lock is held, forwards argv via `second-instance` event, and quits.
4. Running instance receives argv, extracts URL, creates a new tab, focuses window.

### User opens a local file via file association

1. User double-clicks `page.html` in Explorer.
2. OS launches Chiaroscuro with the file path as argument.
3. Same single-instance flow as above.
4. Running instance converts path to `file:///C:/path/to/page.html`, creates tab.

### App launched with URL as initial argument (cold start)

1. App is not running. User clicks a link or opens a file.
2. App starts, acquires single-instance lock.
3. After renderer is ready, parses initial argv for URLs/files, creates tabs.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

None.

### Cross-feature interactions

- **Tabs**: Creates new ephemeral tabs via `tabs:create` command.
- **App State**: Focuses the window via `app-state` / platform `focusWindow`.

## Commands & Events

### Commands

- `external-link:open` — Open a URL in a new tab. Payload: `{ url: string }`.

### Events

- `external-link:received` — Emitted when one or more external URLs are received. Payload: `{ urls: string[] }`.

## Unresolved Issues

None.
