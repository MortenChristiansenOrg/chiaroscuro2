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
conditions. Do not use fixed sleeps or retry mutating actions. The fixture saves
traces for each process generation and captures state, target inventory,
accessibility, console/network errors and available screenshots on failure.
`result.json` includes the error and a rerun command.

## CI

PR CI builds once, runs the existing E2E suite and the deterministic verification
scenarios on Linux, and runs a separate native Windows verification job. Both
upload artifacts even after failures. Component previews in the design system
complement this coverage but cannot replace native Electron tests.
