---
name: browse-app
description: Launch and interact with the Chiaroscuro Electron app or design system website via playwright-cli. Use when you need to start the app, navigate pages, click elements, take screenshots, or inspect console/network state. Trigger phrases include "launch the app", "start the app", "open the app", "browse the app", "take a screenshot of the app".
---

# Goal

Launch and interact with the running Chiaroscuro app **or the design system website** using `playwright-cli`.

## Invocation

- `/browse-app` — Launch the Electron app and connect
- `/browse-app design-system` — Launch the design system website

## Targets

|               | **App**                                 | **Design System**              |
| ------------- | --------------------------------------- | ------------------------------ |
| What          | Electron browser app                    | Vite-served documentation site |
| Launch        | `launch-app.sh`                         | `launch-docs.sh`              |
| Teardown      | `teardown-app.sh`                       | `teardown-docs.sh`            |
| Build         | `electron-vite build` + sync to Windows | `bun run docs:dev --host`     |
| Window chrome | Yes (custom title bar)                  | No                            |

## Prerequisites

`playwright-cli` must be installed globally (already on `PATH`). No MCP configuration needed.

## Browser Interaction via `playwright-cli`

All browser interaction uses `playwright-cli` via the Bash tool. The CLI manages its own headless Chromium browser with persistent sessions.

### Key commands

```bash
# Browser lifecycle
playwright-cli open [url]             # open browser (optionally navigate)
playwright-cli open --persistent      # use persistent profile (survives browser restart)
playwright-cli close                  # close browser

# Page inspection (also returned automatically after most commands)
playwright-cli snapshot              # get page accessibility tree with element refs
playwright-cli screenshot            # screenshot current page
playwright-cli screenshot <ref>      # screenshot specific element
playwright-cli screenshot --full-page # full scrollable page

# Interaction (refs come from snapshot output)
playwright-cli click <ref>           # click element
playwright-cli fill <ref> <text>     # fill input
playwright-cli type <text>           # type text into focused element
playwright-cli press <key>           # press key (e.g., Enter, ArrowDown)
playwright-cli hover <ref>           # hover over element
playwright-cli select <ref> <val>    # select dropdown option
playwright-cli resize <w> <h>        # resize viewport
playwright-cli goto <url>            # navigate to URL

# Debugging
playwright-cli console               # list console messages
playwright-cli console error         # errors only
playwright-cli network               # list network requests
playwright-cli eval '<func>'         # evaluate JS on page

# Monitoring
playwright-cli show                  # open visual dashboard for all sessions

# Tabs
playwright-cli tab-list              # list tabs
playwright-cli tab-new [url]         # open new tab
playwright-cli tab-select <n>        # switch to tab
playwright-cli tab-close [index]     # close tab
```

### Automatic snapshots

Commands like `goto`, `click`, `fill` etc. automatically output a snapshot of the page state after execution. You don't need to run `playwright-cli snapshot` separately unless you want to refresh the view without performing an action.

### Workflow pattern

1. Take a `snapshot` to get element refs
2. Use refs to `click`, `fill`, `hover` etc.
3. Take `screenshot` to verify visual state
4. Read the screenshot image file with the Read tool to see the result
5. Repeat

## WSL Environment Setup

This project runs in WSL2. The Electron app runs on Windows.

### CDP Port Configuration

The CDP port is read from `ELECTRON_APP_PORT` in `.env.local`. All scripts (`launch-app.sh`, `connect-app.sh`, `teardown-app.sh`) use this value automatically. If the env var is missing, scripts will error with instructions.

You can override with `--cdp-port PORT` on any script.

### Starting the app (Electron)

The launcher builds, syncs to Windows, launches Electron, and auto-connects `playwright-cli` via CDP.

```bash
.claude/skills/browse-app/scripts/launch-app.sh                        # build if needed + launch + connect
.claude/skills/browse-app/scripts/launch-app.sh --rebuild               # force rebuild
```

`playwright-cli` connects directly to the Electron renderer via CDP — no separate browser window. You can interact with the actual Electron UI including WebContentsView tabs.

To reconnect manually (e.g., after daemon dies):

```bash
.claude/skills/browse-app/scripts/connect-app.sh
```

### Starting the design system

```bash
.claude/skills/browse-app/scripts/launch-docs.sh
```

This starts Vite, swaps `.playwright/cli.config.json` to standalone browser mode (backing up any CDP config), and auto-opens the page in `playwright-cli`. No manual `playwright-cli open` needed.

### Stopping

```bash
# Close playwright-cli browser:
playwright-cli close

# For app:
.claude/skills/browse-app/scripts/teardown-app.sh

# For design system:
.claude/skills/browse-app/scripts/teardown-docs.sh
```

`teardown-docs.sh` restores the CDP config backup if one exists, so subsequent `launch-app.sh` / `connect-app.sh` runs work correctly.

## Config Management

`playwright-cli` reads `.playwright/cli.config.json` from the project root to decide how to connect:
- **App (CDP)**: `connect-app.sh` writes a config with `"cdpEndpoint"` pointing at Electron's debugging port.
- **Design system (standalone)**: `launch-docs.sh` replaces the config with one that has no `cdpEndpoint`, so `playwright-cli` launches its own Chromium.

The scripts handle backup/restore automatically. If you get a `connectOverCDP: Timeout` error when browsing the design system, the CDP config is active — run `launch-docs.sh` to fix it.

## Connect Workflow

1. Run the appropriate launch script and wait for confirmation:
   - **App:** `launch-app.sh` — builds, launches Electron, and auto-connects `playwright-cli` via CDP
   - **Design system:** `launch-docs.sh` — starts Vite and auto-opens in `playwright-cli`
2. Run `playwright-cli snapshot` to confirm the page loaded
3. Run `playwright-cli screenshot` and read the image to confirm visuals
4. For app, use `playwright-cli tab-list` to see all Electron pages and `playwright-cli tab-select <n>` to switch

## Tips

- Save screenshots to the scratchpad directory, not the project
- Always `snapshot` before interacting to get fresh element refs
- When something looks wrong, take a snapshot too to understand the DOM structure
- Use `--full-page` on screenshots to capture scrollable content
