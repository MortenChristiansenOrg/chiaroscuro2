# Specification for App State Feature

## Overview

The App State feature remembers certain UI layout settings between app launches.

This includes the size of the Action Context panel and the tab palette.

## Terminology

- **App state**: user UI preferences that are restored on startup.
- **Action Context width**: the width of the Action Context panel.
- **Tab palette width**: the width of the tab palette overlay panel.

## Requirements

- When the user resizes the Action Context panel, the new width must be saved.
- The saved Action Context width must be restored on startup.
- When the user resizes the tab palette, the new width must be saved.
- The tab palette should remain closed until the user opens it, but it should use the previously saved width when shown.

## Workflows

### Restore layout on startup

- Start the app.
- The Action Context panel uses the last saved width (if any).

### Resize and persist Action Context

- Resize the Action Context panel.
- When resizing completes, the new width is saved and used next time the app starts.

### Resize and persist tab palette

- Open the tab palette.
- Resize the tab palette.
- When resizing completes, the new width is saved and used the next time the tab palette opens.

## Interactions

### Keyboard shortcuts

None.

### Mouse interactions

- **Resize Action Context**: Drag the Action Context resize handle.
- **Resize tab palette**: Drag the tab palette resize handle.
