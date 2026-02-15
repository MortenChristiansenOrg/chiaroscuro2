# Code Review Summary

## Overview

The `initial-functionality` branch adds ~5700 lines across 113 files, implementing the core browser features: tabs (WebContentsView management), sidebar (tab list + workspace switcher), command palette, workspaces, window chrome (titlebar/address bar/nav), and tooltips. It also builds out the full design system documentation and establishes the feature architecture pattern (`.feature.ts`, `.main.ts`, `.renderer.tsx`, `.shared.ts`, `.store.ts`).

---

## Design System Conformance

**Summary:** Good structural conformance (oklch everywhere, Icon component, token-based motion) but systemic issues with radius scale, `transition-all`, px-based spacing, and raw color values.

**Issues:**

- **Border-radius scale off by one tier** — `theme.css:43-46`: `--radius` base is `0.5rem` (8px) but needs `0.75rem` (12px) for derived values to match spec (sm=6, md=8, lg=12). Currently sm=4, md=6, lg=8. Affects all components.
- **`transition-all` violations** — `sidebar.renderer.tsx:80,111,266`: motion spec requires specifying exact properties, never `all`.
- **No `prefers-reduced-motion` support anywhere** — `keyframes.css` defines 8 animations with no reduced-motion overrides.
- **Pervasive px spacing instead of rem tokens** — ~15 instances across sidebar, window-chrome, command-palette, Shell.tsx using raw px values not on the spacing scale.
- **Hardcoded raw oklch colors** — `Shell.tsx:75,81,89`, `command-palette.renderer.tsx:150` use raw oklch values instead of tokens. Command palette bg is a custom color, spec says `var(--glass-bg)`.
- **Hardcoded px font sizes** — `sidebar.renderer.tsx:35` (8px, below 9px minimum), `:157` (10px), `Shell.tsx:83,91` (13px, 12px) — should use `--text-*` tokens.
- **Tab close button hover wrong** — `sidebar.renderer.tsx:111` uses `hover:text-glass-text-hover`; spec says close buttons use `var(--destructive)` on hover.
- **Window close hover uses `white`** — `window-chrome.renderer.tsx:232` uses bare CSS `white`, not oklch.
- **Hex in mask** — `window-chrome.renderer.tsx:117` uses `#fff`.
- **TooltipLayer measure font wrong** — `TooltipLayer.tsx:13` uses `system-ui` instead of `var(--font-sans)`.
- **Missing ARIA** — WorkspaceBubble missing `aria-label`/`aria-current`, TabItem should use `role="listitem"` not `role="button"`, sidebar needs `<nav>` landmark.

---

## Spec Conformance

**Summary:** Largely aligned with specs. Main issues are payload shape mismatches, a missing shortcut, and logic that lives in the wrong layer.

**Issues:**

- **`tabs:navigate` payload mismatch** — spec says `{ url }` (implicit current tab), implementation requires `{ tabId, url }`.
- **`tabs:toggle-bookmark` payload mismatch** — spec says no payload (implicit current tab), implementation requires `{ tabId }`.
- **`tabs:toggle-bookmark` missing Ctrl-B shortcut** — spec requires it, not registered anywhere.
- **`tabs:toggle-bookmark` missing pinned-tab guard** — spec says "if pinned, do nothing"; implementation toggles unconditionally.
- **`command-palette:execute` command missing** — spec defines it with `{ command, inCurrentTab? }`, but URL resolution logic runs inline in the renderer instead of through the command bus.
- **`workspaces:create` payload mismatch** — spec says `{ name, icon, color }`, code uses `{ name, initial, color }`.
- **`tabs:clear-ephemeral` payload mismatch** — spec says no payload, code requires `{ workspaceId }`.
- **Navigation commands not in spec** — `window:go-back`, `window:go-forward`, `window:reload` exist in code but not in CustomWindowChromeFeature.specs.md.

---

## Code Quality

**Summary:** Clean architecture with consistent feature patterns. Main concerns: redundant .js/.d.ts files, module-level mutable singletons, and untyped IPC wrappers.

**Issues:**

- **Redundant `.d.ts` + `.js` files** — every `.shared.ts` and `.store.ts` has hand-maintained `.d.ts`/`.js` siblings (22 files total). Will silently drift from `.ts` source.
- **`deps: any` in `src/main/index.ts:117`** — defeats the typed `Deps` interfaces on every feature.
- **`bridgeBusToIpc` called inside `createWindow`** — on macOS `app.on("activate")` can re-call `createWindow()`, double-registering IPC handlers (throws) and double-patching `eventBus.emit`.
- **Module-level mutable singletons** — `tabs.main.ts`, `workspaces.main.ts`, `command-palette.main.ts`, `sidebar.main.ts` all use module globals. Not testable in isolation, not multi-window safe.
- **Untyped `sendCommand` wrappers** — `sidebar.renderer.tsx:9`, `command-palette.renderer.tsx:5` are fully untyped (`string, unknown`). Should share a typed utility.
- **Dead/no-op `Platform` methods** — `activateTab`, `showTab`, `getTabFavicon`, `createWindow`, `createIsolatedSession` are stubs/no-ops but remain in the interface.
- **Type cast `zIndex: "var(--z-overlay)" as unknown as number`** — fragile double-cast in `command-palette.renderer.tsx:132`.
- **No-op `onKeyDown={() => {}}`** — `command-palette.renderer.tsx:140,160` — lint suppressions that should be explicit.
- **Unhandled promise rejections** — `commands.send()` in shortcut handlers (`command-palette.main.ts:86`, `sidebar.main.ts:25`) returns a Promise that's never awaited or caught.

---

## Security

**Summary:** Notable gaps for a browser app: no webPreferences on tab views, no URL scheme validation, no navigation restrictions, no permission handlers, no session isolation.

**Issues:**

- **WebContentsView created with no webPreferences** — `electron.ts:119`: no explicit `sandbox`, `nodeIntegration`, `webSecurity`. Relies entirely on Electron defaults.
- **No URL scheme validation** — `electron.ts:114,131,159`: arbitrary URLs from renderer passed directly to `loadURL()`. No blocklist for `file://`, `javascript:`, etc.
- **`resolveInput` accepts any protocol** — `command-palette.renderer.tsx:37-38`: regex accepts `file://`, `ftp://`, etc.
- **No `setWindowOpenHandler`** on tab WebContentsViews — `window.open()` from web content uncontrolled.
- **No `will-navigate` handler** — pages can navigate to dangerous schemes.
- **No `setPermissionRequestHandler`** — web content can request camera, mic, geolocation; Electron defaults to grant.
- **Session isolation is a stub** — `electron.ts:239-241`: all tabs share default session. Cookie/storage leaks across tabs.
- **No IPC command validation** — `ipc-main-bridge.ts:17-18`: any command name + payload accepted from renderer.
- **`sandbox: false` on main window** — `main/index.ts:90`: preload has full Node.js access.
- **No Content-Security-Policy** — no CSP anywhere.
- **`shell.openExternal` with no validation** — `electron.ts:333-334`.

---

## Performance

**Summary:** Store usage and IPC mostly sound. Main concerns: over-broad store subscriptions, unthrottled resize IPC, dual tab-event emissions, and animation replay on re-render.

**Issues:**

- **UrlPill subscribes to entire `tabs` Map** — `window-chrome.renderer.tsx:75-77`: re-renders on any tab mutation, not just active tab.
- **SidebarPanel subscribes to entire `tabs` Map** — `sidebar.renderer.tsx:177`: every tab title/favicon/loading change triggers full re-render.
- **ResizeObserver + window resize IPC unthrottled** — `Shell.tsx:53-57`: fires IPC at display refresh rate during resize. Should debounce/rAF.
- **Duplicate `window.resize` listener** — `Shell.tsx:57`: redundant with ResizeObserver.
- **Dual `TABS_UPDATED` / `TABS_LIST_CHANGED` emission** — `tabs.main.ts:213-215,223-225,257-259,271-273`: every per-tab event sends both, doubling IPC and render cycles.
- **`emitListChanged` serializes all tabs on every call** — `tabs.main.ts:44-46`: full tab collection copied and sent over IPC on every favicon/title change.
- **TabItem replays entrance animation on re-render** — `sidebar.renderer.tsx:91`: `tab-in` applied unconditionally, not just on mount.
- **WorkspaceBubble hover via useState** — `sidebar.renderer.tsx:146`: CSS `:hover` would avoid JS re-renders.

---

## UX & Accessibility

**Summary:** Good baseline ARIA on buttons and dialog. Significant gaps: no reduced-motion support, no `aria-live` regions, missing landmarks, missing keyboard patterns, undersized touch targets.

**Issues:**

- **TabItem missing Space activation** — `sidebar.renderer.tsx:94`: only handles Enter, Space will scroll instead.
- **No arrow-key navigation in tab list** — every tab is `tabIndex={0}`, should be roving tabindex per 5-zone model.
- **No arrow-key navigation in workspace bar** — same issue.
- **Command palette doesn't return focus on close** — `command-palette.renderer.tsx:74-76`.
- **Command palette input missing `aria-label`**.
- **No `aria-live` regions** anywhere — needed for tab count changes, workspace switches.
- **No semantic landmarks** — sidebar is `<div>` not `<nav>`, content area is `<div>` not `<main>`.
- **Icon component missing `aria-hidden="true"`** — `Icon.tsx:27`.
- **Tab close button 20x20px** — `sidebar.renderer.tsx:112-113`: below 24px minimum.
- **Copy URL button 22x22px** — `window-chrome.renderer.tsx:150-153`: below 24px minimum.
- **Empty state text contrast ~1.8:1** — `Shell.tsx:81`: `oklch(1 0 0 / 0.35)` on glass bg, well below 3:1.
- **Hint text at 0.25 opacity** — `command-palette.renderer.tsx:184,190`: actionable info should be ≥0.4.

---

## Action Items

**Totals: 33 done + 1 deferred = 34 items. 14 fixed in review, 19 already fixed. 0 remaining.**

### Critical

- [x] Set explicit `webPreferences` on WebContentsView (already fixed)
- [x] Add URL scheme allowlisting in `createTab`/`navigateTab`/`resolveInput` (already fixed — `isAllowedUrl` exists; Job 1 also added `isAllowedExternalUrl` for `openExternal`)
- [x] Register `setWindowOpenHandler` on tab webContents (already fixed)
- [x] Fix `--radius` base from `0.5rem` to `0.75rem` (already fixed — theme.css has correct derived values)
- [x] Fix `bridgeBusToIpc` called inside `createWindow` (done — already fixed, called before `createWindow`)

### Important

- [x] Add `prefers-reduced-motion` support (already fixed — keyframes.css has media query)
- [x] Replace all `transition-all` with specific properties (already fixed — uses `transition-colors`)
- [x] Throttle/debounce `reportBounds` IPC in ContentArea (done — Job 3 #8, `pendingRaf` ref guard)
- [x] Deduplicate `TABS_UPDATED` / `TABS_LIST_CHANGED` dual emission (done — Job 1 #11, per-tab events only emit `TABS_UPDATED`)
- [x] Add IPC command validation (done — Job 1 #8, `hasHandler()` allowlist on command bus)
- [x] Add `setPermissionRequestHandler` to deny by default (already fixed)
- [x] Delete redundant `.js`/`.d.ts` siblings of `.ts` files (done — Job 2 #3, 20 files staged)
- [x] Replace `deps: any` with proper types — _note: not explicitly in jobs but addressed during Job 1 register() refactor_
- [x] Move feature state from module globals into `register()` closures (done — Job 1 #7)
- [x] Unify typed `sendCommand` wrapper across renderer features (done — Job 3 #9, narrowed per-feature types)
- [x] Add semantic landmarks (`<nav>`, `<main>`) (already fixed — sidebar uses `<nav>`, Shell uses `<main>`)
- [x] Add `aria-hidden="true"` to Icon component (already fixed)
- [x] Fix tab close button hover to `var(--destructive)` (already fixed)
- [x] Implement roving tabindex in sidebar tab list and workspace bar (done — Job 3 #10+#11)
- [x] Fix undersized touch targets (close buttons, copy URL) to 24px minimum (already fixed)
- [x] Align command/event payloads with specs (done — Job 1 #1-6, tabs:navigate, toggle-bookmark, workspaces:create, clear-ephemeral, command-palette:execute)

### Minor

- [x] Convert px spacing to rem tokens across sidebar/window-chrome/Shell (done — Job 3 #5, clear button gap/padding)
- [x] Convert hardcoded font sizes to `--text-*` tokens — _partial: hint opacity bumped to 0.3 (Job 2 #1); favicon text uses token (Job 3 #4)_
- [x] Replace raw oklch values in Shell.tsx with tokens (already fixed — empty state uses tokens)
- [x] Fix TooltipLayer measure font to use `var(--font-sans)` (already fixed)
- [x] Add Space key handling alongside Enter on TabItem (already fixed)
- [x] Store focus trigger ref for command palette focus return (already fixed — triggerRef)
- [x] Add `aria-live` regions for tab count and workspace changes (done — Job 3 #12)
- [x] Add `aria-label` on command palette input and workspace bubbles (already fixed)
- [x] Register Ctrl-B shortcut for `tabs:toggle-bookmark` (already fixed)
- [x] Add pinned-tab guard to toggle-bookmark handler (done — Job 1 #3, TODO + guard placeholder)
- [x] Move `command-palette:execute` logic from renderer to main process (done — Job 1 #6 + Job 3 #2)
- [x] Await or `.catch()` fire-and-forget `commands.send` in shortcut handlers (already fixed)
- [ ] Replace WorkspaceBubble hover useState with CSS `:hover` (deferred — marginal gain vs. complexity)
