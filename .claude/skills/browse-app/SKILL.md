---
name: browse-app
description: Launch and interact with the Chiaroscuro Electron app or design system website via playwright-cli. Use when you need to start the app, navigate pages, click elements, take screenshots, or inspect console/network state. Trigger phrases include "launch the app", "start the app", "open the app", "browse the app", "take a screenshot of the app".
---

# Goal

Launch and interact with the running Chiaroscuro app **or the design system website** using `playwright-cli`.

## Invocation

- `/browse-app` — Launch the Electron app invisibly and connect
- `/browse-app design-system` — Launch the design system website

**Never show a window on the user's desktop unless they ask for it.** The default
launch runs the app inside a virtual X server (Xvfb) in WSL. Use `--windows` (a
visible window on the Windows desktop) only when the user asks for it, or when the
behavior can only be checked on native Windows, such as title-bar drag regions,
hit testing, snap keys, maximize/full screen and desktop pointer input. Say so
before you run it.

## Targets

|               | **App**                                     | **Design System**              |
| ------------- | ------------------------------------------- | ------------------------------ |
| What          | Electron browser app                        | Vite-served documentation site |
| Launch        | `launch-app.sh`                             | `launch-docs.sh`              |
| Teardown      | `teardown-app.sh`                           | `teardown-docs.sh`            |
| Build         | `bun run build` when `out/` is stale        | `bun run docs:dev --host`     |
| Display       | Xvfb in WSL (invisible), 1920×1080          | Headless Chromium             |
| Window chrome | Yes (custom title bar)                      | No                            |

## Prerequisites

`playwright-cli` must be installed globally (already on `PATH`). No MCP configuration needed.
The app launch needs `xvfb-run` and `xauth`. With `openbox`, `obxprop` and
`xcompmgr` installed it also runs a window manager and compositor, which makes
focus, maximize and popups behave like a desktop.

## Browser Interaction via `playwright-cli`

All browser interaction uses `playwright-cli` via the Bash tool. For the app it attaches to Electron over CDP; for the design system it manages its own headless Chromium browser.

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

## Starting the app (Electron)

```bash
.claude/skills/browse-app/scripts/launch-app.sh             # rebuild if out/ is stale + launch + connect
.claude/skills/browse-app/scripts/launch-app.sh --rebuild   # force rebuild
```

The launcher builds when `out/` no longer matches the sources, starts the built
app in Xvfb with a temporary isolated profile, a free CDP port and the automation
debug server, and attaches `playwright-cli` via CDP. You interact with the actual
Electron UI, including WebContentsView tabs. Nothing appears on the user's screen.

Session details are in `test-results/browse-app/session.env` (`CDP_PORT`,
`DEBUG_URL`, `DEBUG_TOKEN`, `PGID`); the app's output is in
`test-results/browse-app/app.log`. The debug-app skill works against this session:
`source` the file and send `Authorization: Bearer $DEBUG_TOKEN` to `$DEBUG_URL`.

To reconnect `playwright-cli` (e.g., after the daemon dies):

```bash
source test-results/browse-app/session.env
.claude/skills/browse-app/scripts/connect-app.sh --cdp-port "$CDP_PORT"
```

### Native Windows (visible; only when needed)

```bash
.claude/skills/browse-app/scripts/launch-app.sh --windows [--rebuild] [--cdp-port PORT]
.claude/skills/browse-app/scripts/teardown-app.sh --windows [--cdp-port PORT]
```

This syncs main/preload to Windows, serves the renderer from a Vite server in WSL
and launches `electron.exe` with CDP. The CDP port comes from `ELECTRON_APP_PORT`
in `.env.local` unless `--cdp-port` is given. For deterministic native Windows
scenarios prefer `bun run verify:app:win` (see `docs/testing/agent-verification.md`).

### Starting the design system

```bash
.claude/skills/browse-app/scripts/launch-docs.sh
```

This starts Vite, swaps `.playwright/cli.config.json` to standalone browser mode (backing up any CDP config), and auto-opens the page in `playwright-cli`. No manual `playwright-cli open` needed.

### Stopping

```bash
# App (invisible session): stops Electron and Xvfb, deletes the temporary profile
.claude/skills/browse-app/scripts/teardown-app.sh

# Design system:
.claude/skills/browse-app/scripts/teardown-docs.sh
```

Always tear the app down when you are done verifying. `teardown-docs.sh` restores the CDP config backup if one exists, so subsequent `connect-app.sh` runs work correctly.

## Config Management

`playwright-cli` reads `.playwright/cli.config.json` from the project root to decide how to connect:
- **App (CDP)**: `connect-app.sh` writes a config with `"cdpEndpoint"` pointing at Electron's debugging port.
- **Design system (standalone)**: `launch-docs.sh` replaces the config with one that has no `cdpEndpoint`, so `playwright-cli` launches its own Chromium.

The scripts handle backup/restore automatically. If you get a `connectOverCDP: Timeout` error when browsing the design system, the CDP config is active — run `launch-docs.sh` to fix it.

## Connect Workflow

1. Run the appropriate launch script (foreground, not background):
   - **App:** `launch-app.sh` — builds if needed, launches Electron invisibly, and auto-connects `playwright-cli` via CDP
   - **Design system:** `launch-docs.sh` — starts Vite and auto-opens in `playwright-cli`
2. Run `playwright-cli snapshot` to confirm the page loaded
3. Run `playwright-cli screenshot --filename=<scratchpad>/name.png` and read the image to confirm visuals
4. For app, use `playwright-cli tab-list` to see all Electron pages and `playwright-cli tab-select <n>` to switch

## Timeouts

Launching takes a few seconds, plus about 30s when it has to build. Use `timeout: 120000` for `launch-app.sh`. Never run the scripts in the background — you need their output immediately. If a launch fails, read the output and `test-results/browse-app/app.log` and fix the root cause.

## Tips

- Save screenshots to the scratchpad directory, not the project
- Always `snapshot` before interacting to get fresh element refs
- When something looks wrong, take a snapshot too to understand the DOM structure
- Use `--full-page` on screenshots to capture scrollable content

## Failure handling

- The launch scripts poll for readiness internally and exit on timeout — **do not manually probe CDP or Vite ports**. If the script fails, read its output and act on it directly.
- If `launch-app.sh` fails, report it and fix the cause. Do not fall back to `--windows`, `bun dev` or `CHIAROSCURO_HEADED=1` without Xvfb, since those show windows on the user's desktop. The design system (`launch-docs.sh`) can cover component visuals but does not verify the Electron app.
