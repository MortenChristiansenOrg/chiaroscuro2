# Specification for Domain Scripts Feature

## Overview

Personal JavaScript scripts customize the websites used in this browser. Scripts
belong to an exact domain and can run after page loads or manually through the
command palette and optional aliases and shortcuts. All scripts remain local.

## Terminology

- **Script**: A named JavaScript function body, which may use `await`.
- **Domain**: An exact HTTP(S) hostname; subdomains are configured separately.
- **Path pattern**: A pathname starting with `/`, with `*` matching any characters.
  Query parameters and fragments are ignored; `/*` matches every path.
- **Action**: An enabled script with manual execution selected.

## Requirements

- Domain settings include a Scripts section with add, edit, enable/disable and
  remove controls. Editing uses an explicit Save/Cancel form.
- Save name, source, domain, enabled state, execution mode, path pattern, optional
  alias and shortcut through DataStore. Restore them after browser restart.
- Run enabled automatic scripts once after a matching main-frame page finishes
  loading, including reloads, restored tabs and sub-tabs. Changes to title or
  favicon alone do not run scripts. Saving/enabling affects future loads.
- Run manual actions on the current page, or the topmost sub-tab when open.
  Internal pages, other domains and unmatched paths cannot run the action.
- The palette lists matching actions and executes the selected action without
  navigating. Optional aliases start with `/`, such as `/copy-issue`.
- Browser page routes and existing shortcut bindings take precedence; conflicting
  aliases or shortcuts produce a useful save error.
- Scripts run in the page with DOM access, without access to the browser's
  privileged command bridge. `copy(text)` writes text to the clipboard after
  successful execution. Manual scripts may use user-gesture page APIs.
- Validate the target document at execution and discard clipboard output if it
  navigated or closed while the script was running.
- Show execution failures with the script name in domain settings and in the
  palette when invoked there. Errors from one automatic script do not stop others.
- Disabling/removing a script prevents future execution and removes its shortcut;
  it does not undo page changes already made by JavaScript. Reload to reset them.

## Workflows

### Add an automatic script

1. Open a site's domain settings and select Scripts → Add script.
2. Enter a name, choose page-load execution, optionally limit the path, and write
   JavaScript, for example `document.querySelector('.feed')?.remove();`.
3. Save and reload a matching page. The script runs after the page loads.

### Run a personal action

1. Create a manual script, for example `await copy(document.title);`.
2. Optionally assign `/copy-title` or an available modified keyboard shortcut.
3. On a matching page, select its name in the palette, enter its alias, or press
   its shortcut. The current page stays open.

## Interactions

### Keyboard shortcuts

- Existing Ctrl+T opens the command palette. Arrow keys and Enter select actions.
- Each manual script may have an optional local shortcut with modifiers.
- Form controls use normal Tab navigation; Save and Cancel are explicit buttons.

### Mouse interactions

- Add script opens an editor; Edit changes an existing script.
- Enable/disable and Remove affect the saved script.
- Clicking a palette action runs it on the visible matching page.

### Cross-feature interactions

- Domain settings compose the script editor and cards alongside CSS and permissions.
- Tabs and sub-tabs provide page lifetime events and the current page target.
- The palette queries matching actions and resolves exact aliases through commands.
- Platform owns document execution, clipboard writes and scoped shortcuts.

## Commands & Events

### Commands

- `domain-scripts:list` — List saved scripts, optionally for a domain.
- `domain-scripts:save` — Validate and save a script.
- `domain-scripts:remove` — Remove a script by ID.
- `domain-scripts:run` — Run a manual script on a matching target page.
- `domain-scripts:actions` — List matching manual actions, optionally filtered.
- `domain-scripts:run-alias` — Run a matching action's exact alias, if available.

### Events

- `domain-scripts:changed` — Saved scripts changed for a domain.
- `domain-scripts:executed` — A script succeeded or failed on a target page.

## Unresolved Issues

- Automatic execution on SPA route changes and persistent DOM observers are
  outside this initial feature. Scripts can install their own observers.
- A script cannot undo arbitrary JavaScript effects or stop a synchronous loop.
