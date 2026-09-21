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

To exercise an unpacked release executable and its `app.asar`, set
`CHIAROSCURO_PACKAGED_EXECUTABLE` to its absolute path when running `verify:app`.
The same isolated profile and scenarios are used, without passing the local
`out/main/index.js` entry point. For PDF engine regressions, run
`bun run verify:app e2e/scenarios/mupdf.spec.ts` with that variable set.

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

For MV3 extension checks use `bun run agent:app --sandbox`, or instantiate
`AppSession(artifactDir, [], true)`. Playwright otherwise injects `--no-sandbox`,
which prevents Electron's service-worker preloads from running. The normal app
launch keeps sandboxing enabled; do not disable it to test extensions.

The controller reports `ready`, a fixture URL, CDP connection URL, artifact
directory and targets. Send one JSON object per line. Startup build output precedes
the JSONL responses. Each action returns `passed`, `partial` or `failed`; a partial capture or action failure
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
move the scenario onto one display. Startup fits the owned shell onto the display;
Windows invisible maximized borders are clipped, with crop geometry recorded in
`*.composed.json`. Capture errors do not replace the original
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

### Native title-bar hit testing

For the address-bar icon click report in #51, run the optional diagnostic:

```bash
bun run verify:app:win --address-bar
bun run verify:app:win --address-bar --maximized
# Or inside a prepared native Windows checkout:
bun run diagnose:address-bar
```

This uses the same isolated `AppSession` and local fixture site. It compares
Playwright/CDP clicks with the Windows desktop pointer at each button's icon
center and left padding, with Reload as a positive control. The Windows helper
checks the foreground window and window under the pointer before clicking,
accounts for display scale and renderer zoom, and records `WM_NCHITTEST` results:
`HTCLIENT` (1) versus `HTCAPTION` (2). A caption region can consume mouse input
before the renderer receives it; a successful CDP click alone cannot verify this
path. See [Electron's draggable-region behavior](https://github.com/electron/electron/blob/main/docs/tutorial/custom-window-interactions.md)
and [Windows hit-test results](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nchittest).

Results, hover screenshots, geometry, native input records and the standard
evidence bundle are saved under `test-results/address-bar/`, mirrored to
`test-results/windows/address-bar/` by the WSL launcher. The diagnostic restores
clipboard text and cleans up its own profile. It distinguishes the exact report
(blocked icons with working padding), a broader failure (padding also blocked),
no reproduction, and a failed positive control. Missing desktop screenshots are
reported as partial evidence with a nonzero exit; renderer screenshots do not
establish desktop composition. The diagnostic remains optional. `e2e/scenarios/address-bar.spec.ts` is the Windows regression for #51: icon/padding native clicks, hit tests, hover and command effects in restored and maximized windows, including after opening and closing Find.

### Startup diagnostics

`bun run diagnose:startup LABEL` records five fresh-profile launches each with
0, 20 and 100 bookmarked tabs against a local fixture, including launch-to-ready
time (`readyMs`, immediately after shell/feature readiness), separate end-to-end
first-tab DOM readiness (`firstTabReadyMs`, absent for zero tabs), native
WebContents count, working set and a separate first-load measurement
of the updater module. Results go to `test-results/startup/LABEL.json`.
`bun run verify:app:win --startup LABEL` runs the same diagnostic natively on
Windows and copies the results back. Compare builds on the same host without
concurrent builds/tests; these are warm-filesystem development/test launches,
not cold-boot packaged startup numbers. Test mode keeps diagnostic recording on
and skips the production updater and palette prewarm.

For the recorder independently, build and run
`bun build e2e/diagnostics/recording.ts --target=node --packages=external --outfile=out/verification/recording.mjs`
then `node out/verification/recording.mjs`. It compares enabled/disabled recording
with 1,000 events each containing 100 tabs; this measures serialization overhead,
not end-to-end startup. See [measured results](startup-and-distribution.md).

`e2e/scenarios/startup.spec.ts` verifies restored tabs through a full restart,
first UI activation, closing an unvisited tab, duplication and enabling an
extension. Dormant views are materialized before extension loading because the
current extension API identifies tabs by native WebContents IDs. Profiles with
enabled extensions retain eager native tab inventories for compatibility.

### Remaining gaps

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

## Official Bitwarden acceptance

`e2e/scenarios/bitwarden.spec.ts` is opt-in because it needs an unpacked official
Bitwarden package and a disposable local Vaultwarden server. Set
`BITWARDEN_TEST_EXTENSION` to the extension folder and `BITWARDEN_TEST_CERT` to
the local server's public TLS certificate. It pins that certificate's SPKI only;
normal certificate validation remains enabled elsewhere. Set `BITWARDEN_TEST_TOTP=1`
when the fixture account has its test authenticator enabled.

The fixture account is `extension-test@example.test`, with the deliberately public
password `Disposable extension test password 2026!`. Never point this scenario at a
personal vault. It expects Vaultwarden at `https://localhost:18329` and a local
HTTP form server on port 18328. Seed Fixture Alpha (`alpha-user` /
`alpha-fake-password`) for `http://127.0.0.1:18328/alpha` and Fixture Beta
(`beta-user` / `beta-fake-password`) for `http://localhost:18328/beta`.
The `/iframe` page embeds the `/alpha` form; forms label fields Username and Password.
The optional test TOTP secret is the RFC test value
`GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`. The scenario changes Alpha's password and creates
one disposable entry; reset the fixture between runs.

Run `bunx playwright test --config playwright.verification.config.ts e2e/scenarios/bitwarden.spec.ts`
after building. The same scenario can run with native Windows paths/environment
variables in the Windows verification deployment. This proves self-hosted account
workflows; selecting cloud endpoints is supported but it is not a test of a real
Bitwarden cloud account.

Set `BITWARDEN_TEST_PREVIOUS_EXTENSION` to an unpacked official 2026.3.0 package to
exercise the signed store update to the current fixture version after login,
including expanded permission review, restart, identity and vault retention. This
optional scenario uses the real store; it expects a newer release with added permissions.

For the installation UI alone, run
`BITWARDEN_INSTALL_UI_TEST=1 bun run verify:app e2e/scenarios/extensions-ui.spec.ts`
after building. It downloads the official Chrome Web Store package into an isolated
profile and exercises review, cancellation, installation, disable/restart/enable,
and opening the login popup. No vault or account is needed. On Windows, set the
environment variable in the Windows process running the scenario. The same file's
built-in page identity/history scenario runs without network access in normal CI.

### Inline autofill and command acceptance (#64)

`e2e/scenarios/bitwarden-autofill.spec.ts` uses the same disposable account,
`BITWARDEN_TEST_EXTENSION` and `BITWARDEN_TEST_CERT`. It starts its own form server
on an ephemeral port, so only the Vaultwarden TLS endpoint at
`https://localhost:18329` must already be running. Reset the seeded Alpha/Beta
passwords before running it; the older lifecycle scenario edits Alpha.

The scenario enables inline suggestions through Bitwarden's UI, selects its
sandboxed inline suggestion with pointer input, sends the fill shortcut through
Electron's native input path, checks that page-load filling stays off until enabled,
and enables both the page-load switch and the default item setting. It checks two
hosts, an embedded form, cross-origin/unmatched negative cases over the autofill
settling window, restart locking, the shortcut's unlock popup and filling after unlock.
`inline.png` captures the official menu; no replacement React component is involved.
Run it with `bun run verify:app e2e/scenarios/bitwarden-autofill.spec.ts`.

The normal CI extension scenario requires no vault or downloads. It checks assigned
and conflicting shortcuts, native command delivery into nested frames, inaccessible
host exclusion, storage lifetime and restart on Linux and native Windows. Unit tests
cover modifier mapping, repeats/focus, delayed commands across same-URL navigation,
nested parent IDs and detached-frame lookup. OS-global shortcut conflicts and
arbitrary site/iframe combinations remain outside this fixture's evidence.
