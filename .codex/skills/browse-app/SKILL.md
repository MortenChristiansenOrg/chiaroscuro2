---
name: browse-app
description: Launch, inspect and interact with the Chiaroscuro Electron app or its design system. Use for app screenshots, UI verification, target selection and reproducible browser scenarios.
---

# Browse and verify Chiaroscuro

When the user asks to run, launch, or open the **dev browser on Windows**, deploy
the complete built app to Windows and run Windows Electron with its local built
renderer. This is the default for the user's manual testing. Read the
[Windows deployment workflow](references/development.md#windows-dev-browser-for-manual-testing)
before launching. The browser must remain usable after WSL or the agent session
stops. Set `ELECTRON_RENDERER_URL` to the deployed renderer's local `file://` URL
to select the app's separate dev identity. Do not point it at a server, start
Vite, create `.dev-server-pid`, or substitute an isolated test session for this
request. Use HMR only when the user explicitly requests hot reload.

For verifying changes, use the existing Electron fixture through the shared
controller/scenarios. Read [agent verification](../../../docs/testing/agent-verification.md)
for target relationships, evidence scope, Windows prerequisites and genuine gaps.

- `bun run build && bun run verify:app` runs deterministic scenarios on the real
  app, including restart, sub-tabs, native popup focus, downloads and drag.
- `bun run agent:app` launches an isolated Electron instance and local fixtures.
  Keep stdin open (a PTY works). It prints readiness, target IDs, a CDP URL and an
  artifact directory. Send JSONL actions; discover their schema with
  `bun run agent:app --help`.
- `bun run verify:app:win` runs the same fixture natively on Windows from WSL;
  add `--interactive` for the controller.
- `launch-app.sh --isolated` and `launch-app.sh --verify` delegate to these paths.
  They do not use a personal browsing profile or fixed debug port.

Start with `targets`, then `inspect` the correct ID. Built-in pages share the
shell renderer; sub-tabs and palettes are distinct targets. Use visible UI
input (`click`, `fill`, `press`, `shortcut`, `drag`) to verify behavior. Commands
are for setup/diagnosis. Rediscover native target IDs after `restart`.

Use `capture` and inspect its images. `*.renderer.png` and Playwright screenshots
cover one renderer only. `*.composed.png` includes native view layers and child
windows via the desktop capture. Ozone headless cannot provide composed evidence;
use the Linux Xvfb/Openbox/xcompmgr scenario runner or a permitted native Windows desktop.
Capture manifests explicitly report missing/unsupported evidence.

For title-bar hover/click bugs, compare desktop input with CDP: native draggable
regions can suppress pointer events even when Playwright clicks succeed. Run
`bun run verify:app:win --address-bar` for the icon/padding diagnostic and Reload
positive control described in the verification guide. Report its actual outcome
and any partial evidence; do not treat a CDP-only pass as proof of native hit testing.

`stop`, EOF or a termination signal cleans up the controller's own process and
profile. When using `playwright-cli` with the controller's CDP URL, keep ownership
with the controller: send it `stop` to tear down. Do not run the personal dev
teardown script against an isolated session.

For Windows deployment, explicitly requested HMR sessions, reconnecting an
already running app, or the design system website, read
[development browser workflow](references/development.md).
The existing `launch-docs.sh`, `connect-app.sh` and `playwright-cli` integration
remain available. Design-system verification complements Electron verification;
it does not substitute for native view/focus/process checks.
