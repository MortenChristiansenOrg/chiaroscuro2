# Specification for Tab Palette Feature

## Overview

The Tab Palette feature is an overlay panel used for tab-related tooling.

It provides a single place to access functionality like “Find in Page” and tab/domain customization.

See also:

- `FindTextFeature.specs.md` for the Find in Page workflow.
- `TabCustomizationFeature.specs.md` and `DomainCustomizationFeature.specs.md` for customization behavior.

## Requirements

- The tab palette must be toggleable via keyboard.
- The tab palette must close automatically when the active tab is deactivated.

## Workflows

### Open/close the tab palette

- Press the tab palette shortcut.
- If the palette is closed, it opens.
- If the palette is open, it closes.

### Close on tab change

- When the current tab is deactivated (for example, switching tabs), the palette closes.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **F1**: Open tab palette.

### Mouse interactions

- None.
