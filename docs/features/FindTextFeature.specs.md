# Specification for Find Text Feature

## Overview

The Find Text feature provides “Find in Page” for the current tab.

It opens the tab palette and focuses the Find input, then highlights matches within the currently active tab.

See also: `TabPaletteFeature.specs.md` for how the tab palette opens/closes.

## Terminology

- **Find term**: the text currently being searched for in the page.
- **Find mode**: the state where a find term is active and next/previous navigation is enabled.

## Requirements

- Find must operate on the currently active tab.
- Starting Find must open the tab palette and focus the Find input.
- While Find mode is active, the user must be able to navigate between matches and exit Find mode.
- Find mode must stop when the tab palette is dismissed or the current tab is deactivated.

## Workflows

### Start Find in Page

- Press the Find shortcut.
- The tab palette opens and the Find input receives focus.
- Enter a term to start searching within the page.

### Navigate between matches

- While Find mode is active:
  - Tab moves to the next match.
  - Shift+Tab moves to the previous match.

### Stop finding

- While Find mode is active, press Escape.
- Find highlights are cleared and Find mode ends.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcuts:

- **Ctrl-F**: Open tab palette and focus the Find in Page input.
- **F3**: Open tab palette and focus the Find in Page input.
- **Tab**: Navigate to the next match (while Find mode is active).
- **Shift+Tab**: Navigate to the previous match (while Find mode is active).
- **Esc**: Stop finding (while Find mode is active).

### Mouse interactions

- None.
