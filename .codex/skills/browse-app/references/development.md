# Goal

Launch and interact with the running Chiaroscuro app **or the design system website** using `playwright-cli`.

## Invocation

- `/browse-app` or “run the dev browser on Windows” — Deploy the complete build to Windows and launch it for manual testing
- `/browse-app design-system` — Launch the design system website

## Targets

|               | **App**                                 | **Design System**              |
| ------------- | --------------------------------------- | ------------------------------ |
| What          | Electron browser app                    | Vite-served documentation site |
| Launch        | Windows deployment procedure below     | `launch-docs.sh`              |
| Teardown      | Close the native app window             | `teardown-docs.sh`            |
| Build         | `electron-vite build` + sync to Windows | `bun run docs:dev --host`     |
| Window chrome | Yes (custom title bar)                  | No                            |

## Prerequisites

Windows deployment requires WSL interop, native Windows Bun/Node and the repository build tools. `playwright-cli` is optional for inspection; manual testing must not depend on a debugging connection.

## Browser Interaction via `playwright-cli`

This personal development workflow uses `playwright-cli` via the shell. For isolated verification use the shared controller described in SKILL.md. In app/CDP mode the CLI controls Electron's renderers; only the standalone design-system workflow launches its own Chromium browser.

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

### Windows dev browser for manual testing

When the user asks to run, launch or open the dev browser on Windows, **build and
deploy the app to Windows, then run it there using its built renderer files**.
The browser must keep working when the agent turn ends or WSL stops. Do not use
Vite/HMR or an isolated automation session for this request. Do not create
`.dev-server-pid`.

1. Run `bun run build` in the repository to build the current main, preload and
   renderer code.
2. Resolve the Windows user's `%USERPROFILE%` through PowerShell. Deploy into
   `%USERPROFILE%\.chiaroscuro-dev`, converting that path with `wslpath` for WSL
   file operations. Gracefully close an existing instance of this dev app before
   replacing its files so the launch cannot reuse an older process. Sync the
   **whole** `out/` directory, including `out/renderer/`,
   and `resources/`. Copy `package.json`, `bun.lock` and `bunfig.toml`. Preserve the
   user's browser profile and unrelated files; scope sync deletion to the build
   and resource directories.
3. In that Windows directory, use native Windows Bun to run
   `bun install --frozen-lockfile` and `bun run setup:electron`. Follow the runtime
   versions pinned by the repository. Existing portable Windows runtimes may be
   added to the launching PowerShell process's PATH.
4. In the launching PowerShell process, clear `ELECTRON_RENDERER_URL`,
   `ELECTRON_RUN_AS_NODE`, `NODE_ENV`, `DATA_DIR`, `CHIAROSCURO_AUTOMATION` and
   `CHIAROSCURO_DEBUG_TOKEN` so inherited dev/test settings cannot redirect this
   launch. Then set `ELECTRON_RENDERER_URL` to the deployed renderer's local file
   URL: `([Uri](Join-Path $PSScriptRoot 'out\renderer\index.html')).AbsoluteUri`
   in a PowerShell script stored in the deployment directory. The app uses this
   variable to select its separate dev identity/profile; leaving it unset can
   collide with an installed production browser. It must be a `file://` URL,
   with no dependency on a renderer server. Launch
   `node_modules\electron\dist\electron.exe` with `.` as its app argument and
   the deployed directory as its working directory, using `Start-Process`.
   Leave the native process running for the user.
5. Confirm the Windows app window is responsive and its actual UI has loaded.
   When CDP is available, check that the shell URL is the deployed
   `file://.../out/renderer/index.html`. Otherwise inspect the native window.
   A debugger connection failure must not terminate a usable manual-test app.

The current `launch-app.sh` default and `bun run dev:win` are **HMR launchers**:
they copy only main/preload and serve the renderer from WSL. Do not use them for
the default Windows manual-testing request. Follow the deployment procedure above.

### Explicitly requested hot reload

Only when the user explicitly asks for HMR/hot reload, use `bun run dev:win` or
`.codex/skills/browse-app/scripts/launch-app.sh --rebuild`. These require Vite in
WSL to remain running and are unsuitable for an independent manual-test session.

### Optional CDP inspection

For an app launched with `--remote-debugging-port=PORT`, reconnect using:

```bash
.codex/skills/browse-app/scripts/connect-app.sh --cdp-port PORT
```

The connection scripts also accept `ELECTRON_APP_PORT` from `.env.local` when no
port override is supplied. CDP attaches to the actual Electron renderers; the
standalone design-system workflow launches its own Chromium browser.

### Starting the design system

```bash
.codex/skills/browse-app/scripts/launch-docs.sh
```

This starts Vite, swaps `.playwright/cli.config.json` to standalone browser mode (backing up any CDP config), and auto-opens the page in `playwright-cli`. No manual `playwright-cli open` needed.

### Stopping

```bash
# Close playwright-cli browser:
playwright-cli close

# For the manually deployed app: close its Windows window.
# For an explicitly requested HMR/CDP session:
.codex/skills/browse-app/scripts/teardown-app.sh --cdp-port PORT

# For design system:
.codex/skills/browse-app/scripts/teardown-docs.sh
```

`teardown-docs.sh` restores the CDP config backup if one exists, so subsequent `connect-app.sh` runs work correctly.

## Config Management

`playwright-cli` reads `.playwright/cli.config.json` from the project root to decide how to connect:
- **App (CDP)**: `connect-app.sh` writes a config with `"cdpEndpoint"` pointing at Electron's debugging port.
- **Design system (standalone)**: `launch-docs.sh` replaces the config with one that has no `cdpEndpoint`, so `playwright-cli` launches its own Chromium.

The scripts handle backup/restore automatically. If you get a `connectOverCDP: Timeout` error when browsing the design system, the CDP config is active — run `launch-docs.sh` to fix it.

## Connect Workflow

1. Launch the requested target:
   - **App:** follow Windows deployment above; connect separately if CDP inspection is needed
   - **Design system:** `launch-docs.sh` — starts Vite and auto-opens in `playwright-cli`
2. Run `playwright-cli snapshot` to confirm the page loaded
3. Run `playwright-cli screenshot` and read the image to confirm visuals
4. For app, use `playwright-cli tab-list` to see all Electron pages and `playwright-cli tab-select <n>` to switch

## Timeouts

Allow the build and Windows dependency installation to complete before launching. The docs launcher can wait up to about 30 seconds for Vite readiness. Inspect failures before proceeding; successful process creation alone does not establish that the UI loaded.

## Tips

- Save screenshots to the scratchpad directory, not the project
- Always `snapshot` before interacting to get fresh element refs
- When something looks wrong, take a snapshot too to understand the DOM structure
- Use `--full-page` on screenshots to capture scrollable content

## Failure handling

- The launch scripts poll for readiness internally and exit on timeout — **do not manually probe CDP or Vite ports**. If the script fails, read its output and act on it directly.
- If deployment or native app launch fails, preserve the error and report it. An optional CDP connection failure does not establish an app launch failure; inspect the native window and leave a usable manual-test app running. A design-system preview does not verify the Electron app.
