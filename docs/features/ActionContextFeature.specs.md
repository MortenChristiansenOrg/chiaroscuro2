# Specification for Action Context Feature

## Overview

The Action Context feature controls the visibility of the Action Context panel.

The Action Context panel contains the app’s auxiliary UI, such as pinned tabs, the tab list, workspace switcher, and downloads.

See also:

- `TabsFeature.specs.md`
- `PinnedTabsFeature.specs.md`
- `WorkspacesFeature.specs.md`

## Requirements

- The Action Context panel must be toggleable via a keyboard shortcut.

## Workflows

### Toggle the Action Context panel

- Press the toggle shortcut.
- If the Action Context panel is visible, it becomes hidden.
- If it is hidden, it becomes visible.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **Ctrl-S**: Toggle action context panel.

### Mouse interactions

- None.
