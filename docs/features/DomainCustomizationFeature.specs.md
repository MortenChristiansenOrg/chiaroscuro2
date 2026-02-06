# Specification for Domain Customization Feature

## Overview

The Domain Customization feature lets you apply per-domain custom CSS in tabs.

This is used to tweak how specific sites look by injecting a user-managed CSS file into pages on that domain.

It is surfaced through the tab palette UI.

## Terminology

- **Domain**: the current tab’s domain (host name).
- **Domain CSS**: a CSS file associated with a domain.
- **CSS enabled**: whether custom CSS injection is active for the current domain.

## Requirements

- Domain customization must be stored per domain and persisted across app runs.
- If CSS is enabled and a CSS file exists for the current domain, the CSS must be injected into the active tab.
- If CSS is disabled (or there is no CSS file), any previously injected CSS must be removed.
- When switching tabs or navigating to a different domain, the applied CSS must update accordingly.
- If the domain CSS file is edited while the app is running, the changes must be applied to the current tab.
- If the domain CSS file is deleted while CSS is enabled, CSS must be disabled for that domain.

## Workflows

### Enable/disable CSS for the current domain

- Open the tab palette.
- Toggle the “CSS enabled” setting for the current domain.
- When enabled, the app injects the domain CSS (if present) into the page.
- When disabled, the app removes the injected CSS.

### Create/edit the CSS file

- Open the tab palette.
- Choose to edit the domain CSS.
- The app ensures a CSS file exists for the domain and opens it in the editor.
- The app automatically enables CSS for the domain.
- Changes to the file are applied as you edit.

### Remove the CSS file

- Remove the custom CSS file for a domain (either from the UI or by deleting it on disk).
- The app stops watching the file, removes injected CSS, and disables CSS for that domain.

## Interactions

### Keyboard shortcuts

- None.

### Mouse interactions

- None (this feature is driven by UI controls inside the tab palette).
