# Key Implementation Details

## 1. Window & Tab Management

- Use `BrowserWindow` with `WebContentsView` (not deprecated `BrowserView`)
- Each tab = one `WebContentsView` attached to window
- Tab switching = show/hide views, not destroy/create
- Closing a tab or sub-tab runs `beforeunload`. Electron cancels a vetoed close silently, so
  `will-prevent-unload` asks the shared "Leave this page?" prompt (`src/platform/leave-prompt.ts`)
  synchronously; Leave overrides the veto. `tabs:close` passes `showBeforeAsking`: a tab that is
  not shown (closed from the sidebar, by clearing ephemeral tabs or by an extension) is closed
  like a page when quitting (`closeShowingWarning`, below), so it is shown before it is asked
  about (#150). The `onShowPageBeforeAsking` callbacks then return how to go back (workspaces
  switches back to the workspace and tab the user was on and restores the remembered tab of the
  page's workspace; sub-tabs shows a tab's sub-tabs again if it is still active), which run
  once the user answered, before a left page closes, waiting at most 1 s. They do not run when
  the user moved to another tab or workspace meanwhile, when the tab or workspace they were on
  is gone, while a quit asks about pages, or when staying on the page cancelled a quit (the quit
  shows it). Going back to a pinned tab restores the tab its workspace remembered. The shown
  tab and sub-tabs are asked about directly, as before. Overlapping closes of one tab share one
  close.
- Quitting, closing the browser window and update restarts ask about unsaved changes first
  (#121). `before-quit` and the browser window's `close` are prevented until
  `ElectronPlatform.confirmQuit()` (`src/platform/quit-confirmation.ts`) has closed the pages
  in turn: page windows newest first (pop-ups and extension windows, registered with
  `askBeforeClosingWindow`; closing an opener destroys its pop-ups without `beforeunload`),
  top sub-tab, shown tab, hidden tabs. Electron 44 runs a vetoing `beforeunload` on
  close even on pages without a user gesture, and offers no way to run it without closing, so
  every live page is closed (about 4 ms each when it does not warn). Overlapping requests share
  one answer; once confirmed, the real quit tears down features and closes windows without
  asking. Stay resolves false before anything is torn down. Tabs whose pages closed become
  unloaded tabs again: pending entries, or new unloaded native views while an extension is
  loaded, since extensions identify tabs by native contents. `onTabEvent` subscriptions are kept
  per tab and move to the new contents. The tabs feature marks them unloaded and shows the
  page the user stayed on (or reloads the shown tab), the workspaces feature switches to the
  stayed page's workspace, and the sub-tabs feature reloads sub-tab pages in place. Tabs were persisted as they changed, so the next session restores them all.
- Like Chrome, a page is shown before it is asked about (#140). Electron says a page warns
  only by running its `beforeunload` on close, and `will-prevent-unload` must be answered
  synchronously while the window cannot repaint. So `closeShowingWarning`
  (`src/platform/quit-confirmation.ts`) closes each page once without asking: a page without a
  warning closes at no extra cost, and one that warns is kept. It is then shown and the user
  is asked directly (`confirmLeave`, outside `will-prevent-unload`); **Leave** closes it again,
  overriding a second warning, so a handler that warns only once is still asked about. Electron
  runs a vetoing `beforeunload` on every close attempt, in every frame, so the probe finds the
  pages Chromium would ask about. Pre-detection was rejected: the DevTools protocol (`DOMDebugger.getEventListeners`)
  needs `webContents.debugger`, which a single client can attach and which conflicts with
  user DevTools, misses out-of-process iframes and cannot tell whether a listener will veto;
  a main-world preload hook is visible to pages and misses frames without the preload.
  Showing runs the `onShowPageBeforeAsking` callbacks in registration order (workspaces
  switches workspace and activates the tab; sub-tabs activates a sub-tab's parent and attaches
  that sub-tab, or hides the sub-tab frame over a parent whose sub-tabs were left), restores a
  minimized window or brings a page window forward, then waits for two animation frames in
  the page, the browser window and the sub-tab window (an isolated world, so page scripts are
  untouched). Showing waits at most 1 s plus 0.5 s for painting, and counts as prompt time
  (`whileShowingPage`). One page is shown and asked about at a time (`oneAtATime`), so a
  page passed over cannot ask over another page being shown; a turn is given up after 3 s
  beyond time spent showing pages and answering prompts. A page found to warn after the
  user stayed elsewhere, or while it was being shown, is kept without asking. A tab the user
  closes during the probe is asked about directly (`closeTabContentsAsking`), or shown first
  if it is not shown. `confirmLeave` names the page by title and address (`pageAddress`).
- A quit and the tabs the user closes while it asks share their answers (#151): `QuitAnswers`
  (`src/platform/quit-confirmation.ts`), created for each quit attempt, records the answer
  given for each page, in the quit's own prompts or by a tab close (and a pop-up closed by the
  user, through `wrapWindowLeavePrompt`). A tab close requested during the attempt keeps using
  its answers after the quit ended. A page answered once is neither shown nor asked about
  again: Leave lets the other close leave it, and Stay keeps it. A Stay given by a tab close
  cancels the quit exactly like Stay in the quit's own prompt (`closePagesInTurn`'s `stayed`):
  the page is kept and shown, the pages after it are untouched. A probe that joins another
  close which kept the page without asking (`StayedOnPage.asked` false) still asks.
- Quitting never waits on pages: 3 s per page and 5 s in total, excluding time spent in
  prompts (`leavePromptTime`). A page passed over keeps its prompt: staying on it while later
  pages are checked cancels the quit, and once the quit is confirmed it leaves without asking.
  An explicit tab close during a quit wins over restoring the tab. Update restarts ask first,
  then start the installer and quit only once its process started (#141). electron-updater's
  `quitAndInstall()` quits before an asynchronous start failure is known, so
  `InstallerLauncher` (`src/features/installer/installer-launch.ts`) calls `install()` and
  follows each `spawnLog` it makes: `EACCES`/`UNKNOWN` retry through `elevate.exe`, whose exit
  code (non-zero when it could not start the installer or the user declined) is awaited here,
  other failures arrive as `error` events, and `ENOENT` is opened with the shell here rather
  than by electron-updater, which would not report the outcome. Updater errors of concurrent
  checks or downloads do not end the launch. A failed start cancels the quit (closed
  pages stay as unloaded tabs) and resets `quitAndInstallCalled`, so Restart can retry and the
  update still installs on a later quit; a started installer keeps it set, so quitting does not
  run the installer again. Failures after the start are not cancelled. A hung renderer's `beforeunload` is ended by Chromium after
  about 1 s. Windows `session-end` and `powerMonitor` `shutdown` skip asking. Termination
  signals reach Chromium's own handler, which quits normally and may ask; Node signal
  listeners never run, and a second signal kills the process.
- Keyboard focus: outside macOS, Electron focuses the window's own (shell) WebContents whenever the window is activated. `WindowContentFocus` (`src/platform/window-focus.ts`) remembers which shown page had focus when the window was deactivated and focuses it again, so a page input stays typeable after switching to another app or closing the command palette. A click or touch that activates the window keeps the focus it gives (#114). Sub-tabs are shown in a child window that can be activated so their pages can take keyboard focus (#124). It has its own `WindowContentFocus`; `returnFocusFromSubTabWindow` moves focus back to the browser window's page when the last sub-tab closes. Its own contents only frame the sub-tab page, so activating it returns focus to the page rather than the frame: Electron can report the frame's focus on an activation before the window's earlier blur. An activation that ends before its focus event runs leaves the page to restore for the next one. When the browser window is activated while a sub-tab page had focus, focus moves on to the sub-tab window unless a click or touch on the browser window activated it (`ActivationOrigin`, `src/platform/window-activation.ts`, #131). On Windows, `WM_ACTIVATE`'s `WA_CLICKACTIVE` tells, before the focus event; `WM_MOUSEACTIVATE` does not reach the browser window because Chromium's child window under the pointer handles it. Elsewhere a press in the browser window's contents within 100 ms of its activation counts as the click.
- Web tabs use `setZoomMode("isolated")`: zoom belongs to each WebContents, including sub-tabs and adopted contents, while cookies/session sharing is unchanged. Keyboard zoom targets the topmost sub-tab when open. PDF reader zoom is independent.
- Window-open routing accepts native creation through Electron's `createWindow` callback
  and adopts the resulting view as a sub-tab (foreground) or standalone tab (background).
  Reuse the supplied guest WebContents when present, including its opener and session;
  links without a guest are loaded once with their referrer and POST data. Returning
  `deny` after creating an unrelated view makes `window.open()` return `null`, so
  blocked-popup fallbacks can navigate the parent to the same destination (#165).
  Explicit popup dispositions keep the BrowserWindow path. Browser-owned views outlive
  their opener; the tabs/sub-tabs features own their close and promotion lifecycle,
  including removing native views and metadata when a script calls `window.close()`.
- Multi-window support from day 1
- **Per-tab session isolation**: Use `session.fromPartition('persist:tab-{id}')` for isolated tabs
  - Default: shared session
  - Toggle per-tab to create isolated session (like incognito but persistent if desired)

## 2. Command Palette

See `docs/features/CommandPaletteFeature.specs.md` for full spec.

## 3. Sidebar & Tab Model

See `docs/features/SidebarFeature.specs.md`, `docs/features/TabsFeature.specs.md`, `docs/features/PinnedTabsFeature.specs.md`.

## 4. Keyboard Shortcuts

- `globalShortcut` for system-wide shortcuts
- `Menu` accelerators for app shortcuts
- Browser shortcuts act on the browser window. They work while it or a window shown as part
  of it has focus: the sub-tab window, the command palette and an extension's toolbar popup
  (`shortcutWindow` in `src/platform/keyboard-routing.ts`). Global shortcuts are only
  registered then, and menu accelerators check which window holds the focused contents.
  Website popups and extension pop-outs are windows of their own: browser shortcuts do
  nothing there, and Ctrl+W closes them (#115). They keep the hidden application menu,
  because on Windows the accelerators of an owned window without a menu reach its owner,
  which then takes focus.
- A window shown as part of the browser handles its own keys first. The command palette
  consumes its Escape, so it never reaches the sub-tab's Escape (#130).
- Windows ignores its window keys (Win+arrows, Win+Shift+arrows) in the sub-tab window,
  which cannot be snapped, maximized or minimized. Only the arrow's release reaches the app
  (`WindowArrowKeys`). `WindowArranger` (`src/platform/window-arrangement.ts`) then arranges
  the browser window as Windows 11 does, measured with the keys on the browser window:
  halves, quarters, maximize/minimize, full height and other monitors, and back to the bounds
  from before (#129, #134). Electron has no snapping API, so Windows does not know the window
  is snapped: Snap Assist and snap groups do not apply.
- Custom shortcut registry with rebinding support
- Vim-style keybindings optional

## 5. Download Handling

- Intercept via `session.on('will-download')`
- Custom download folder selection per-download or default
- Download progress in UI
- Pause/resume/cancel support

## 6. Chrome Extension Support

Bitwarden is the supported extension. See `docs/features/ExtensionsFeature.specs.md` for the release boundary, permission review, staged automatic updates and recovery contract.
The browser uses Electron's native extension runtime plus an in-house adapter; it
has no dependency on `electron-chrome-extensions`.

- Verify official CWS CRX3 signatures and safely extract into staging before approval/activation. Install into a stable unpacked path in the shared persistent Electron session.
- Open extension UI at `chrome-extension://<runtimeId>/...`, with sandboxing and
  context isolation enabled. Never serve extension UI as a local website.
- Reset only the extension origin’s service-worker/code caches during package activation
  and rollback. Electron can otherwise execute persisted scripts from the previous release.
  Preserve native vault storage, IndexedDB and cookies.
- Keep vendor JavaScript unchanged. Loading an older installation removes only
  the identifiable bootstrap prepended by the original experiment.
- Adapt native API objects in place: Chromium can refresh namespace getters after
  startup, and replacement objects would lose the browser adapter.
- Retain native runtime messaging, scripting, local storage and session storage.
  Session keys remain in memory and disappear on browser restart.
- Resolve manifest keyboard commands locally with browser-shortcut priority, worker wake-up,
  listener readiness, and cancellation when the selected document changes. Route action
  shortcuts and `action.openPopup` through the existing native extension popup.
- The action popup closes when it loses focus, including to a window the extension opens
  from it. Only focus returning to the browser window in the 200 ms after it shows (the
  opening click) keeps it open. Opening it again replaces it; the old popup's late events
  never act on the new one.
- Supply browser tab/window operations and selected navigation, menu, permission
  and notification APIs through `src/platform/extension-runtime.ts`. Only loaded
  extension frames/workers in the shared session can invoke these operations.
- Open `windows.create` windows (Bitwarden's pop-out) as framed `popup` windows
  with the browser's accelerator menu hidden. Inside one, `windows.getCurrent` is that
  window, so the extension can close it with `windows.remove`. A `beforeunload`
  veto asks "Leave this page?" natively instead of silently cancelling the close.
- Give each extension window one active tab (its page, ID = native WebContents ID),
  visible only to the owning extension: `tabs.query`, `tabs.get`, `tabs.getCurrent`,
  `windows.getAll`/`get` and the `tabs.on*` events report it, `tabs.remove` closes the
  window and `tabs.update`/`windows.update` focus it. Bitwarden finds, focuses and
  closes its single-action pop-outs this way. Current-window tab queries still return
  the browser window's tabs, even from inside an extension window.
- Report window positions as Chrome's `left`/`top`. `windows.create` and
  `windows.update` honour `left`/`top`/`width`/`height` for extension windows, fitted
  inside the work area of the display they overlap most (or the nearest one), so
  Bitwarden's pop-out opens at the browser window's top right. Extensions cannot move
  or resize the browser window.
- Use native WebContents IDs for extension tabs, and the browser's selected tab
  for active-tab queries. Redact URLs/titles without tabs or matching host permissions.
- Relay native storage invalidations to MV3 workers, whose storage events are
  missing in the tested Electron runtime. Workers re-read native values and
  deduplicate invalidations; the adapter never creates a separate vault store.
- Implement empty, read-only managed storage; additional optional permissions
  are not granted. Cloud `storage.sync`, native messaging/biometrics, extension
  shortcut customization and full Chrome API parity are outside the current scope.

Validation on 2026-09-13 used Electron 44.3.0 and the unmodified CWS Bitwarden
2026.8.0 against a disposable local Vaultwarden 1.37.2 account on Linux and native
Windows. Password/authenticator-code login, sync, editing an existing password,
generation, creating a login, popup filling on two hosts and in a same-origin
iframe, no suggestions on an unrelated host, and restart/lock/unlock/fill passed.
An actual 2026.3.0 → 2026.8.0 upgrade also passed expanded-permission approval,
stable runtime identity, retained account/vault, unlock and fill.
Cloud accounts and cross-origin iframe variants have not been exercised with this
fixture. Passkeys and biometrics are outside the supported boundary.

Issue #64 acceptance on 2026-09-21 used the same Electron/Bitwarden/Vaultwarden
versions on Linux and native Windows. Inline selection in top-level and embedded
forms, the fill shortcut, opt-in page-load filling on both fixture hosts and an
embedded form, no page-load credentials in a cross-origin frame or unrelated
host, and restart locking / shortcut-triggered unlock all passed. The sandboxed
CI fixture also explicitly verifies native scripting denial on an ungranted frame.
Bitwarden completes its fill state asynchronously; acceptance waits for stable
filled values before navigating away.

A known navigation issue remains: editing an item immediately after creating it
in the same popup session saves the change but can leave the popup on the Edit
screen. On 2026-09-16 the identical failure was reproduced with unmodified
Bitwarden in Chrome for Testing, without Chiaroscuro's compatibility layer.
See [Known issues](../../KNOWN_ISSUES.md) for reproduction steps, the workaround,
the tested versions and the limits of that comparison. Vendor code is unchanged.
Ordinary existing-item editing and creation pass the acceptance scenario in
`e2e/scenarios/bitwarden.spec.ts`.

The sandbox is required for service-worker preloads. Playwright normally adds
`--no-sandbox`; extension tests explicitly use `AppSession(..., [], true)`.
Run the deterministic MV3 storage/active-tab/restart/permission regression with:

```bash
bun run build
bunx playwright test --config playwright.verification.config.ts e2e/scenarios/extensions.spec.ts
```

Electron still documents a [limited extension API](https://www.electronjs.org/docs/latest/api/extensions).
Its [service-worker startup fix](https://releases.electronjs.org/pr/50611) is
relevant to this branch, but upgrading Electron alone does not supply browser
semantics or repair storage-event delivery to workers.

## 7. Fixed URL & Tab Customization

Bookmarked tabs record a **fixed URL** — the URL at the time of bookmarking. This is stored in a transient `Map<TabId, string>` (`fixedUrls`) in the main process (not persisted to disk).

**Lifecycle:**
- **Created** when a tab is bookmarked — captures the current URL as `fixedUrl`.
- **Emitted** via `tabSnapshot()`, which spreads `fixedUrl` onto the `Tab` object for IPC events (`TABS_LIST`, `TAB_UPDATED`, etc.).
- **Used at restore** — when a bookmarked tab is restored/navigated, it loads `fixedUrl` instead of the last-visited URL, unless `fixedAddressDisabled` is set in the tab's customization.
- **Cleared** when the tab is closed or the feature re-registers (e.g. hot reload).

The `fixedAddressDisabled` flag is persisted in the tab customization store, allowing users to opt out of fixed-address behavior per tab.

## 8. Tab Lifecycle Management

Three-tier lifecycle: **active → suspended → evicted**. Thresholds are user-configurable via the Settings feature.

**States:**
| State | What happens | Cost |
|---|---|---|
| Active/Hidden | WebContentsView exists, renderer throttled by Chromium | Full memory |
| Suspended | `backgroundThrottling` keeps timers/network idle, page stays in memory | Full memory, ~0 CPU |
| Evicted | `webContents.close()` called, only metadata + screenshot retained | < 15 MB |

**Default eviction policy (configurable in Settings):**

- **Pinned tabs**: never evict, only throttle
- **Bookmarked tabs**: evict after 30 min inactive when available RAM < 25%
- **Ephemeral tabs**: evict after 15 min inactive when available RAM < 25%
- **Aggressive mode** (RAM < 15%): evict all non-active non-protected tabs
- **Never evict**: tabs playing audio, running WebRTC, or with unsaved form data

**Eviction flow:**

1. `webContents.capturePage()` → save screenshot as compressed JPEG
2. `webContents.navigationHistory.getAllEntries()` → save nav stack
3. Save URL, title, favicon, scroll position
4. `webContents.close()` → kill renderer process

A quit the user cancels after closing pages to ask about unsaved changes leaves their
tabs in the same unloaded state as restored tabs (no renderer, loaded when shown).

**Restoration flow:**

1. Show screenshot as placeholder immediately
2. Create new `WebContentsView`
3. `navigationHistory.restore({ entries, index })` → restores full nav stack + scroll
4. Fade out screenshot on `did-finish-load`
5. Stagger restores: max 1 tab per 500ms

**Monitoring:** Poll `app.getAppMetrics()` + `process.getSystemMemoryInfo()` every 30s. Map tabs to PIDs via `webContents.getOSProcessId()`.

## 9. Multi-Window Architecture

Main process is authoritative. Each renderer window gets projected Zustand stores synced via IPC.

**Bus topology:** Single command bus + single event bus in main process. Each window renderer gets a thin IPC proxy. Commands carry `windowId` for routing. Events broadcast to all windows.

**Tab ownership:**

- **Pinned tabs**: global, shown in all windows' sidebars. WebContentsView reparented between windows on activation (`removeChildView` → `addChildView`, no recreation).
- **Bookmarked tabs**: per-workspace, owned by one window at a time.
- **Ephemeral tabs**: per-workspace, owned by one window.

**Page full screen:** When a page enters HTML full screen, Electron makes the window that holds its view full screen, and `PageFullScreen` (`src/platform/page-full-screen.ts`) makes the view fill it. A sub-tab's view lives in the sub-tab window, so the browser window goes full screen too and the sub-tab window covers it. Bounds that the tabs and sub-tabs features set meanwhile are held and applied on leaving. Hiding, animating or closing the view leaves full screen. So does confirming a quit or window close, which waits for Electron to save the state the window returned to, so a restart does not reopen in full screen. An open sub-tab's window is hidden while its parent is full screen.

**Window state persistence:** Electron 44 native `windowStatePersistence: true` on the persistent shell, named `main-window`. Native IDs are process-local and must never be used as persistence names. Future independent application windows need durable, distinct names. Electron owns bounds and maximized/fullscreen restoration and adapts to display changes. Legacy `app-state.windowBounds` are validated constructor defaults on migration; native saved state takes precedence. Subsequent application-state saves remove legacy bounds while retaining sidebar width and other fields. Palette, tooltip, sub-tab frame and popup windows are transient and do not enable persistence.

Native restart scenarios wait for Electron's debounced state to reach its preference file before relaunching. Recovery coverage includes off-screen reachability and simulated saved layouts from a removed monitor or larger work area. On an unchanged display Electron preserves partial off-screen positioning while ensuring a reachable area; a changed work area fits the window. These profile fixtures do not replace physical monitor hot-plug or DPI verification.

## 10. Optimistic UI Updates

IPC round-trip is ~0.08ms — most actions don't need optimistic updates. Use selectively:

| Pattern                                       | Actions                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Always optimistic** (renderer-only)         | Sidebar toggle, folder expand/collapse, tab reorder during drag                                    |
| **Optimistic + confirm**                      | Tab activate, bookmark toggle                                                                      |
| **Hybrid** (highlight optimistic, data waits) | Workspace switch (highlight workspace immediately, tab list waits for `workspaces:switched` event) |
| **Wait for main** (with loading indicator)    | Tab create, tab close (mark as "closing"), URL navigation, workspace CRUD                          |

**Reconciliation:** Track optimistic state in a separate `_optimistic` layer in Zustand stores. Events always overwrite confirmed state and clear corresponding optimistic overrides. No explicit rollback logic — if main rejects, the event carries the corrected value. Commands use `send` (fire-and-forget), responses come as events.

## 11. Sidebar Composition

**Direct imports** (Option A). Sidebar imports child components from other features directly. This matches the existing cross-feature store import pattern — no reason to add a separate slot registration system for a single-team app. Sidebar owns layout via flex/gap; child components don't manage their own spacing. Migrate to slot registration only if/when a plugin system is added.

```tsx
// sidebar.renderer.tsx
export function Sidebar() {
  return (
    <aside>
      <PinnedTabsList />
      <WorkspaceSelector />
      <FolderTree />
      <EphemeralTabs />
    </aside>
  );
}
```

## 12. Performance Optimizations

- Lazy load tabs (don't render until focused)
- Limit concurrent WebContentsViews
- Use `v8-compile-cache` for faster startup
- Minimize IPC traffic (batch updates)
- Background tab throttling

## 13. Storage (Data Abstraction)

Application feature data goes through the `DataStore` interface. Electron manages persistent shell geometry and display mode separately in its profile; transient windows do not enable native persistence. Each feature owns its RxDB collection schema and provides migrations. Features never touch RxDB or the filesystem directly.

**RxDB** runs in the main process using the free Filesystem RxStorage. Provides:

- Reactive observable queries (feed directly into Zustand stores via subscriptions)
- MongoDB-like query syntax (no SQL)
- JSON Schema-based validation with TypeScript inference
- Built-in schema migrations, encryption, compression

**Summary of persisted data**:

```
RxDB collections: history, downloads, tabs, workspaces, pinned-tabs,
                  tab-customizations, domain-customizations
JSON files:       settings.json (including sidebar width), shortcuts.json, extensions.json
Electron profile: named persistent shell bounds and display mode
```

**Cloud sync (Convex — optional)**: All data is local-only by default. Convex can be added as a separate optional data store for selective cross-device sync (bookmarks, workspace definitions, user preferences). Convex is not a sync layer for RxDB — it's an independent store for data the user opts to sync. Local RxDB remains the source of truth; synced data is mirrored to/from Convex when connected.

## Session identity and GitHub diagnostics

Prepare each tab session's user-agent and permission handlers before constructing
its web contents. Electron session user-agent changes do not update existing
contents; doing this afterward gave the first tab a different identity. New tabs,
sub-tabs and popup windows now inherit the same prepared identity. Normalize the
app user-agent fallback too, since renderer-created popup contents use that value.

A bounded, memory-only GitHub authentication timeline is available through the
existing debug state provider. See [GitHub session diagnostics](../testing/github-session-diagnostics.md)
for scope, redaction, and how to capture an overnight logout without exporting
credentials. The confirmed identity fix does not close the unproven logout root cause.
