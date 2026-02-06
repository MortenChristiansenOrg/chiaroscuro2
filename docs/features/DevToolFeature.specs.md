# Specification for Dev Tools Feature

## Overview

The Dev Tools feature controls Chromium developer tools for tabs and (in developer scenarios) for the embedded UI surfaces.

## Terminology

- **Dev tools**: the Chromium developer tools window.

## Requirements

- The active tab’s dev tools must be toggleable via a keyboard shortcut.
- When a tab is closed, any dev tools belonging to it must be closed.
- When switching tabs, dev tools for the previously active tab must be closed.

## Workflows

### Toggle dev tools for the current tab

- Press the dev tools shortcut.
- If dev tools are open for the current tab, they close.
- If dev tools are closed, they open.

## Interactions

### Keyboard shortcuts

This feature uses the following shortcut:

- **F12**: Toggle dev tools.

### Mouse interactions

- None.
