# Specification for Tab Customization Feature

## Overview

Per-tab settings that affect how a tab is displayed and how its state is persisted. Accessed via the tab context menu; opens an in-tab built-in page (replacing the tab's web content) similar to the Settings and Domain Customization pages.

See also:

- `TabsFeature.specs.md` for the tab list UI.
- `PinnedTabsFeature.specs.md` and `WorkspacesFeature.specs.md` for how "pinned" and "bookmarked" influence persistence.

## Terminology

- **Customization**: a saved set of per-tab preferences (custom title, fixed-address toggle).
- **Custom title**: an override title shown in the tab list / pinned strip instead of the page title.
- **Disable fixed address**: allows a pinned tab's persisted address to update as you browse (normally pinned tabs keep a fixed address).
- **Return URL**: the tab's original URL before opening the customization page, used to navigate back.

## Requirements

- Customizations must be persisted and restored across app runs.
- Changing a tab's custom title must immediately update the tab list / pinned tab strip.
- Customizations for a tab must be removed when the tab is closed.
- Ephemeral tabs cannot be customized (only bookmarked and pinned tabs support customization).
- Opening the customization page must replace the tab's current content (navigate the tab to the built-in page).
- Closing the customization page must navigate the tab back to its original URL.
- The customization page must not be available for built-in tabs (settings, domain-css, etc.) or ephemeral tabs.

## Workflows

### Customize a tab via context menu

1. Right-click a tab in the sidebar.
2. Select "Customize tab" from the context menu.
3. The tab's web content is replaced by the customization built-in page.
4. Edit the custom title and/or toggle "disable fixed address".
5. Changes are saved immediately as they are made.
6. Click "Done" (or press Escape) to return to the tab's original content.

### Clear a custom title

1. Open the customization page for a tab.
2. Clear the custom title input field.
3. The tab reverts to showing its page title.

## Interactions

### Keyboard shortcuts

- **Escape**: Close the customization page and return to the tab's original content (when the page is focused).

### Mouse interactions

- **Right-click tab → "Customize tab"**: Opens the customization page for that tab.
- **"Done" button**: Returns to the tab's original content.

### Cross-feature interactions

- **Tabs**: Reads tab data (title, URL, type). Navigates tabs via `tabs:navigate`. Listens to `tabs:closed` to clean up.
- **Sidebar / Context Menu**: Adds "Customize tab" entry to the existing tab context menu. Sidebar reads custom titles from the store.

## Commands & Events

### Commands

- `tab-customization:open` — Open the customization page for a tab. Navigates the tab to the built-in page. Payload: `{ tabId: string }`.
- `tab-customization:close` — Close the customization page and navigate back to the original URL. Payload: `{ tabId: string }`.
- `tab-customization:set-title` — Set a custom title for a tab. Payload: `{ tabId: string, title: string | null }`.
- `tab-customization:set-fixed-address-disabled` — Set the fixed-address-disabled flag. Payload: `{ tabId: string, disabled: boolean }`.
- `tab-customization:get-state` — Get the current customization state for a tab. Payload: `{ tabId: string }`. Response: `TabCustomization`.

### Events

- `tab-customization:changed` — A tab's customization changed. Payload: `{ tabId: string, customization: TabCustomization }`.
- `tab-customization:removed` — A tab's customization was removed (tab closed). Payload: `{ tabId: string }`.

## Unresolved Issues

- None.
