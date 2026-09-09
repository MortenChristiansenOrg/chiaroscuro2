# Verifying the actual browser

Use the shared `AppSession` in `e2e/automation/session.ts` for ad hoc checks and
repeatable scenarios. It extends the existing Playwright Electron fixture and HTTP
debug server. A standalone Chromium or design-system check cannot establish that
Electron's native views, overlays, focus or process persistence work.

## Run checks from a stopped app

```bash
bun install --frozen-lockfile
bun run build
bun run verify:app                         # representative scenarios, JSON results and artifacts
bun run verify:app --grep 'PDF toolbar'    # one scenario
bun run e2e                                # existing fast Ozone headless suite
bun run verify:app:win                      # from WSL, run natively on Windows
```

Linux's full suite uses Xvfb at 1920×1080 and Openbox. Install `xvfb`, `xauth` and
`openbox` and `xcompmgr`; the launcher checks window-manager readiness and saves its log in
`test-results/desktop.log`. An existing desktop can be used with
`CHIAROSCURO_HEADED=1 bun run verify:app`. Node and Bun versions follow
`package.json` and `.node-version`. Electron is downloaded by `setup:electron`.

The WSL launcher requires Windows interop, rsync, Python 3, native Windows Bun
1.3.11+ and Node 24.15+ (24.20.0 is pinned in CI). It builds locally, syncs into
`%USERPROFILE%\.chiaroscuro-verification`, installs the frozen lockfile on Windows,
runs the same Playwright scenarios, and copies evidence back to
`test-results/windows/`. It also accepts portable `bun.exe` and `node.exe` in that
directory's `runtime/` folder. It does not install global runtimes or alter device
policies. If Device Guard rejects Electron, retain the launch log and use a
permitted native Windows host/CI; that local run is **not verified**.

Every session generates a new temporary profile, isolates both application data
and Chromium's cookies/cache, redirects downloads away from the normal Desktop,
and uses OS-assigned inspector, CDP, HTTP debug and fixture ports. No `.env.local`
or manually launched app is needed. `restart()` closes the full process, saves
data and relaunches with exactly that profile; `close()` deletes it. Tests may seed
with `session.command()` and reset by closing and creating a new session. Never
point tests at a normal user profile. An interrupted/crashed controller can leave
a temp directory, identifiable by its `chiaroscuro-verify-` prefix and launch log.

## Interactive agent workflow

```bash
bun run agent:app --help                   # JSON Schema for the controller's input
bun run agent:app                          # keep stdin open (for example, a tool PTY)
# Equivalent entry point:
.codex/skills/browse-app/scripts/launch-app.sh --isolated
# Native Windows from WSL:
bun run verify:app:win --interactive
```

The controller reports `ready`, a fixture URL, CDP connection URL, artifact
directory and targets. Send one JSON object per line. Startup build output precedes
the JSONL responses. Each action returns `passed` or `failed`; an action failure
also captures evidence and makes the eventual process exit nonzero. EOF, `stop`,
SIGINT or SIGTERM closes only this controller's Electron instance and fixture site.

```json
{"action":"targets"}
{"action":"inspect","target":"window:1"}
{"action":"shortcut","target":"window:1","keyCode":"T","modifiers":["control"]}
```

Inspect the returned palette target and fill its `#input` with the reported local
fixture URL, then send `press` with `Enter`. Use the discovered tab target for
`click`, `fill`, `press`, `scroll`, `upload`, `drag` and `assert-text`. Selectors are
Playwright selectors, including `role=button[name='Apply']` and CSS. `shortcut`
uses Electron's `sendInputEvent` because CDP keyboard dispatch does not trigger
every Electron `before-input-event` shortcut. It exercises the input path, without
invoking the shortcut's command handler directly.

```json
{"action":"event-cursor"}
{"action":"state","feature":"tabs"}
{"action":"capture","label":"after-change"}
{"action":"restart"}
{"action":"stop"}
```

Use the cursor *before* an action, then `wait-event` with `name` and `after` to
observe its effect. `assert-text` and event/target waits have deadlines and report
their last observations. They retry observations, never mutating actions. For
custom conditions in a scenario use Playwright assertions or `waitUntil`.

`commands` lists registered commands; `setup-command` sends a diagnostic/setup
command. Feature payload/response types remain in `src/features/*/*.shared.ts`.
They are **not runtime schemas**: the full shared command-contract migration is
issue #44 and is not implemented here. The controller's JSON Schema describes
controller requests, not feature command payloads. Do not infer validation from
command registration. Internal commands can prepare data but do not verify the UI
path being changed.

For a CLI-driven browser connection, pass the reported CDP port to the existing
`connect-app.sh --cdp-port PORT` and use `playwright-cli` while the owning
controller remains running. Teardown belongs to the controller (`stop`), not the
personal dev launcher. After restart, reconnect and rediscover targets.

## Targets and evidence

`GET /state/targets` reports logical tab IDs, native window and WebContents IDs,
CDP IDs, URLs, kind, parent relationships, focus, visibility and geometry. Window
bounds use screen coordinates; tab bounds are relative to their owning window.
Built-in pages share the shell's CDP target and retain their logical tab ID.
Sub-tabs point at their parent tab; palette/frame windows point at their parent
window. Native IDs change after restart. Tabs retain their persisted IDs. Select
by kind/relationship/ID, not an index in the list or a URL that multiple tabs share.

`inspect` includes an ARIA snapshot, DOM focus, DOM dialog/menu/listbox surfaces
and active Web Animations. Plain renderer screenshots do not include overlaid
WebContentsViews or child windows. Artifacts are named by scope:

| Artifact | Meaning |
| --- | --- |
| `*.renderer.png`, `*.inspection.json` | One renderer and its accessibility/focus data |
| `*.composed.png` | OS screen capture cropped to the visible application's window bounds, including native views/child windows |
| `*.frames.json`, `*.frame-*.png` | One renderer's filmstrip with compositor timestamps; up to 90 frames |
| `trace-N.zip` | Playwright actions, DOM snapshots and screenshots for process generation N |
| `*.state.json`, `*.targets.json` | Feature state, commands/results, event history, logs and runtime versions |
| `journal.json`, `*.last-targets.json` | Bounded controller/console/network journal and last inventory, including after a crash |
| `result.json`, `results.json` | Per-test and suite status, failures and rerun information |
| `*.evidence.json` | Capture errors/unsupported capabilities; missing evidence is never a successful capture |

Inspect the actual images as well as the assertions. Keep the app unobscured for
desktop capture. A union of windows spanning displays is currently rejected;
move the scenario onto one display. Capture errors do not replace the original
test failure. Open traces with `bunx playwright show-trace PATH`.

## Representative coverage

`e2e/scenarios/verification.spec.ts` runs five scenarios using real UI navigation:

- Palette input → local tab → sub-tab input/focus → close overlay → native popup
  input → return focus to parent, with layer and composed screenshots.
- Local PDF → toolbar zoom → complete process restart → restored PDF and zoom.
  This exposed and fixed renderer-only zoom persistence; zoom is now saved by
  document filename/content hash and restored when fetching the PDF.
- File input, scrolling, clipboard copy (restoring prior text), controlled denied
  notification permission, downloaded bytes, pointer sidebar resizing and native
  maximize control. Permission setup is seeded; this does not claim to test the
  native permission prompt itself.
- Native pointer drag reorders real sidebar tabs and records animation frames.
- An intentional missing-target assertion writes a failed result and coherent
  evidence bundle; the outer test succeeds only if the failure evidence exists.

The fixture site serves local HTML, a generated one-page PDF, a controlled
download and a deliberate HTTP 503 route. No external websites are needed for
these scenarios. Add fixtures/routes alongside `site.ts`, use page objects for
interaction and `test.step` for longer workflows. Choose checks based on the
changed behavior, not solely on whether the app still responds.

## Limits and CI

Ozone headless has no desktop compositor and Electron 44's native popup path
can terminate its process. The existing fast suite uses Ozone; the broader suite
uses Xvfb + a window manager or native Windows. Do not report headless renderer
screenshots as composed visual evidence. Native OS file pickers, external-app
drag/drop, system permission menus, touch/IME/accessibility assistive technology
and global OS hotkey conflicts remain gaps. `setInputFiles` verifies the file
input integration, not the OS picker. Filmstrips help inspect timing but are not
a fixed-frame-rate desktop video or a perceptual animation assertion. Separate
independent main browser windows are not implemented by the application;
multi-window coverage here uses actual palette, sub-tab and popup windows.

The debug server binds loopback, rejects Origin-bearing requests and unexpected
Host values, and requires an unlogged per-session bearer token in automation.
Test hooks require `NODE_ENV=test`, `CHIAROSCURO_AUTOMATION=1` and an absolute
isolated `DATA_DIR`. HTTP server startup uses a random port in this mode.

PR CI runs both the existing E2E suite and these scenarios under Linux, plus a
native Windows job. Both upload evidence even on failure. Unit checks include
E2E/controller TypeScript compilation. Use the design system for component
appearance and interactions; retain Electron scenarios for process boundaries,
native layers and persistence. The PDF component documentation links to its
restart scenario; design-system demos do not replace it.
