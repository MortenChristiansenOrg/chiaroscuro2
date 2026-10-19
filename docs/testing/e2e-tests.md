# Electron E2E tests

The runnable source of truth is `e2e/fixtures/electron-app.ts`, which creates an
`AppSession` from `e2e/automation/session.ts`. It launches the built Electron app,
waits for the shell and feature startup, and cleans up the isolated data and
Chromium profile in a finally block. Tests receive `appSession`, `electronApp` and
`shellPage`; `e2e/fixtures/test.ts` composes the feature page objects.

Run `bun run build && bun run e2e`. The existing suite uses Ozone headless on Linux,
with an explicit 1920×1080 virtual screen, 5s test deadlines, no retries and 2 CI /
4 local workers. The fixture has a separate bounded lifecycle/evidence timeout.
Each worker's profile and debug ports are isolated. `bun run setup:electron`
prepares Electron before parallel workers start.

### Stale builds

The session tests whatever is in `out/`, so it refuses a build that no longer
matches the sources; otherwise old behavior looks like a new bug. `bun run build`
writes `out/build-stamp.json` with content hashes of the build inputs (`src/`
without unit tests and `src/test-utils/`, `resources/`, `electron.vite.config.ts`,
`package.json`, `bun.lock` and the root `tsconfig*.json`) and of the outputs in
`out/main`, `out/preload` and `out/renderer`. A failed build leaves no stamp.
Before any worker starts, the Playwright global setup
(`e2e/automation/global-setup.ts`) stops `bun run e2e` and `bun run verify:app`
when:

- the stamp is missing,
- an input changed, was added or was removed since the build, or
- an output changed since the build, for example because `bun dev` rewrote `out/`.

The error names the first differing files and says to run `bun run build`.
`AppSession.launch` runs the same check for entry points outside Playwright, such
as `agent:app` and the diagnostics. Line endings are normalized before inputs are
hashed, so a Linux build matches a Windows checkout with CRLF files. CI builds
once and the E2E and Windows jobs check that build against their own checkouts.
`verify:app:win` builds before it copies `out/`, the inputs and `scripts/` to
Windows. The check is skipped with `CHIAROSCURO_PACKAGED_EXECUTABLE`. Set
`CHIAROSCURO_SKIP_BUILD_CHECK=1` to test an old build on purpose, such as when
bisecting. `bun scripts/stamp-build.ts check` runs the check by itself.

For coordinated scenarios, native Windows, composed screenshots, restart and
failure diagnostics, read [Agent Verification](./agent-verification.md). Run
`bun run verify:app`; this uses the same session under Linux Xvfb/Openbox/xcompmgr or native
Windows. Its 30s scenario deadline includes restart and evidence collection and
does not raise deadlines for the existing tests.

## Page objects and assertions

Keep reusable locators/actions in `e2e/pages/`. Compose page objects around a
Playwright `Page`; tests assert observable behavior. Prefer roles and labels,
using stable tab IDs for repeated rows. For native WebContentsViews, discover the
target with `appSession.targets()` and obtain its page using
`appSession.page(target)`. A built-in page shares the shell target. Never assume
`firstWindow()` or one renderer's screenshot represents all native layers.

```ts
import { expect, test } from "../../fixtures/electron-app";

test("sidebar is available", async ({ shellPage }) => {
  await expect(shellPage.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
});
```

Use real keyboard/pointer input for the path being verified. Scenario setup can
use `appSession.command(name, payload)` or the existing IPC helper, but it is not
proof that a button or shortcut works. Electron shortcuts sometimes need
`webContents.sendInputEvent` instead of CDP keyboard dispatch; see
`VerificationPage.navigate` for the actual palette input path.

Use Playwright assertions, `waitUntil`, and history cursors/event waits for
conditions. Do not use fixed sleeps or retry mutating actions. When an action
reloads or navigates a page you then inspect, wrap it in `waitForNewDocument`
(`e2e/automation/wait.ts`): `waitForLoadState` and locators can still observe
the old document, which passes too early or fails when the old context goes
away. The fixture saves traces for each process generation and captures state,
target inventory, accessibility, console/network errors and available
screenshots on failure.
`result.json` includes the error and a rerun command.

## CI

PR CI builds once, runs the existing E2E suite and the deterministic verification
scenarios on Linux, and runs a separate native Windows verification job. Both
upload artifacts even after failures. Component previews in the design system
complement this coverage but cannot replace native Electron tests.
