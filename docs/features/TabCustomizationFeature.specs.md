# Specification for Tab Customization Feature

## Overview

The Tab Customization feature lets you apply per-tab settings that affect how tabs are displayed and how their state is persisted.

It is surfaced through the tab palette UI.

See also:

- `TabsFeature.specs.md` for the tab list UI.
- `PinnedTabsFeature.specs.md` and `WorkspacesFeature.specs.md` for how "pinned" and "bookmarked" influence persistence.

## Terminology

- **Customization**: a saved set of per-tab preferences.
- **Custom title**: an override title shown in the UI instead of the page title.
- **Disable fixed address**: a setting that allows a pinned tab's persisted address to update as you browse.

## Requirements

- Customizations must be persisted (in SQLite) and restored across app runs.
- Changing a tab's custom title must update the UI (tab list / pinned tab strip) for that tab.
- Customizations for a tab must be removed when the tab is closed.
- When ephemeral tabs are expired (8-hour TTL), any customizations for those tabs must also be removed.

## Workflows

### Change a tab's custom title

- Open the tab palette for the current tab.
- Set a custom title.
- The tab's display title updates in the UI.

### Toggle "disable fixed address"

- Open the tab palette for the current tab.
- Toggle the "disable fixed address" setting.
- The setting affects how the tab's address is persisted (notably for pinned tabs).

## Interactions

### Keyboard shortcuts

- None.

### Mouse interactions

- None (this feature is driven by UI controls inside the tab palette).

## Commands & Events

### Commands

- `tab-customization:set-title` — Set a custom title for a tab. Payload: `{ tabId: string, title: string | null }`.
- `tab-customization:toggle-fixed-address` — Toggle the "fixed address" setting for a tab. Payload: `{ tabId: string }`.

### Events

- `tab-customization:changed` — A tab's customization changed. Payload: `{ tabId: string, customization: TabCustomization }`.

## Unresolved Issues

- **Custom favicon**: Should it be possible to set a custom favicon in addition to a custom title?
- **Customization scope**: The "disable fixed address" concept is somewhat confusing. Consider renaming to "allow address updates" or "live address" for clarity.
