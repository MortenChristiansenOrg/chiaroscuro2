# Specification for Local Web App Feature

## Overview

Allows users to configure a local development server for a tab. When the tab is activated, the configured command runs automatically in the project directory. Process output streams to the Terminal overlay.

## Terminology

- **Local Web App**: A tab with an associated project directory and start command
- **Start command**: Shell command executed via `cmd.exe /c` when tab activates
- **Process**: The running dev server instance associated with a tab

## Requirements

- User must be able to specify a project directory path in the tab palette
- User must be able to specify a start command in the tab palette (e.g., `npm start`)
- User must be able to browse for a directory using a folder picker dialog
- Configuration must persist across application restarts
- Process must start automatically when tab with saved config is activated
- Process must stop when its tab other browser application is closed
- Tab must reload automatically after process starts
- Process output must stream to Terminal overlay, distinguished as normal or error output
- Process status (running/stopped/error) must be visible in Tab Palette

## Workflows

### Configuring a tab to run a Local Web App

1. User opens Tab Palette for a pinned/bookmarked tab
2. User enters project directory path (or clicks folder icon to browse)
3. User enters start command
4. User clicks save button
5. Process starts immediately

### Changing the command/path for a Local Web App

1. User opens Tab Palette for a pinned/bookmarked tab
2. User changes the start command or app path
3. User clicks save button
4. The original process is terminated and a new one starts immediately

### Automatic Process Lifecycle

1. When tab with config becomes active, process starts automatically
2. Tab reloads to pick up server
3. Process runs until tab is closed or config deleted
4. When tab or browser closes, process is terminated (including child processes)

### Deleting Configuration

1. User clicks delete button in Local Web App section
2. Process stops (if running)
3. Configuration is removed from persistence

## Interactions

### Tab Palette UI

- Directory input: text field for path, browse button opens folder dialog
- Command input: text field for shell command
- Save button: saves configuration, starts process if tab active
- Delete button: removes config and stops process
- Status indicator: shows "running" (green), "will start on activation" (amber), or unconfigured state
- Error indicator: warning icon when process has errors

### Keyboard shortcuts

None.

### Mouse interactions

- Click folder icon to browse for directory
- Click save icon to save configuration
- Click delete icon to remove configuration
