# Specification for Tab Palette Feature

## Overview

The Tab Palette is a slide-out panel for editing settings on a specific pinned or bookmarked tab. It provides access to tab customization (custom title, fixed address toggle), domain customization (per-domain CSS), and local web app configuration.

The tab palette only applies to pinned and bookmarked tabs — it is not available for ephemeral tabs.

See also:

- `TabCustomizationFeature.specs.md` and `DomainCustomizationFeature.specs.md` for customization behavior.
- `LocalWebAppFeature.specs.md` for local dev server configuration.

## Requirements

- The tab palette must be toggleable via keyboard.
- The tab palette must only be available when the active tab is pinned or bookmarked.
- The tab palette must close automatically when the active tab is deactivated.
- The tab palette is rendered as a React component within the browser chrome renderer.

## Workflows

### Open/close the tab palette

- Press the tab palette shortcut while a pinned or bookmarked tab is active.
- If the palette is closed, it opens showing settings for the current tab.
- If the palette is open, it closes.
- If the current tab is ephemeral, the shortcut does nothing.

### Close on tab change

- When the current tab is deactivated (for example, switching tabs), the palette closes.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **F1**: Open tab palette.

### Mouse interactions

- None.

## Commands & Events

### Commands

- `tab-palette:toggle` — Toggle the tab palette visibility.
- `tab-palette:close` — Close the tab palette.

### Events

- `tab-palette:visibility-changed` — Emitted when the tab palette opens or closes. Payload: `{ visible: boolean }`.

## Unresolved Issues

- **F1 conflict**: F1 is universally used for "Help" in most applications. This will override browser help and in-page help shortcuts. Consider an alternative.
- **Relationship to command palette**: The command palette (Ctrl-K) and tab palette (F1) serve different purposes but could potentially be confusing. Consider whether some tab palette functionality could be folded into the command palette instead of maintaining two separate overlay panels.
