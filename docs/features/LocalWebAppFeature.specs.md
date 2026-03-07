# Specification for Local Web App Feature

## Overview

Allows users to configure a local development server for a tab. When the tab is activated, the configured command runs automatically in the project directory. Process output streams to the Terminal overlay.

## Terminology

- **Local Web App**: A tab with an associated project directory and start command.
- **Start command**: Shell command executed via Node.js `child_process` when tab activates.
- **Process**: The running dev server instance associated with a tab.

## Requirements

- User must be able to specify a project directory path in Tab Customization.
- User must be able to specify a start command in Tab Customization (e.g., `npm start`).
- User must be able to browse for a directory using a folder picker dialog (Electron's `dialog.showOpenDialog` with `openDirectory` property).
- Configuration must persist across application restarts.
- Process must start automatically when tab with saved config is activated.
- Process must stop when its tab or the browser application is closed.
- Process is spawned via `child_process.spawn` with `shell: true` for cross-platform compatibility.
- Tab must reload automatically after process starts (with a short delay to allow the server to start).
- Process output must stream to Terminal overlay, distinguished as normal or error output.

## Workflows

### Configuring a tab to run a Local Web App

1. User opens Tab Customization page for a pinned/bookmarked tab.
2. User enters project directory path (or clicks folder icon to browse).
3. User enters start command.
4. User clicks save button.
5. Process starts immediately.

### Changing the command/path for a Local Web App

1. User opens Tab Customization page for a pinned/bookmarked tab.
2. User changes the start command or app path.
3. User clicks save button.
4. The original process is terminated and a new one starts immediately.

### Automatic Process Lifecycle

1. When tab with config becomes active, process starts automatically.
2. Tab reloads to pick up server.
3. Process runs until tab is closed or config deleted.
4. When tab or browser closes, process is terminated (including child processes via process group/tree kill).

### Deleting Configuration

1. User clicks delete button in Local Web App section.
2. Process stops (if running).
3. Configuration is removed from persistence.

## Interactions

### Tab Customization UI

- Directory input: text field for path, browse button opens folder dialog.
- Command input: text field for shell command.
- Save button: saves configuration, starts process if tab active.
- Delete button: removes config and stops process.
- Status indicator: shows "running" (green), "will start on activation" (amber), or unconfigured state.
- Error indicator: warning icon when process has errors.

### Keyboard shortcuts

None.

### Mouse interactions

- Click folder icon to browse for directory.
- Click save icon to save configuration.
- Click delete icon to remove configuration.

## Commands & Events

### Commands

- `local-web-app:save-config` — Save local web app configuration. Payload: `{ tabId: string, directory: string, command: string }`.
- `local-web-app:delete-config` — Delete local web app configuration. Payload: `{ tabId: string }`.
- `local-web-app:start` — Start the process for a tab. Payload: `{ tabId: string }`.
- `local-web-app:stop` — Stop the process for a tab. Payload: `{ tabId: string }`.

### Events

- `local-web-app:status-changed` — Process status changed. Payload: `{ tabId: string, status: 'running' | 'stopped' | 'error' }`.
- `local-web-app:output` — Process produced output. Payload: `{ tabId: string, data: string, type: 'stdout' | 'stderr' }`.
