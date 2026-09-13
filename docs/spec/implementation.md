# Key Implementation Details

## 1. Window & Tab Management

- Use `BrowserWindow` with `WebContentsView` (not deprecated `BrowserView`)
- Each tab = one `WebContentsView` attached to window
- Tab switching = show/hide views, not destroy/create
- Web tabs use `setZoomMode("isolated")`: zoom belongs to each WebContents, including sub-tabs and adopted contents, while cookies/session sharing is unchanged. Keyboard zoom targets the topmost sub-tab when open. PDF reader zoom is independent.
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
- Retain native runtime messaging, scripting, local storage and session storage.
  Session keys remain in memory and disappear on browser restart.
- Supply browser tab/window operations and selected navigation, menu, permission
  and notification APIs through `src/platform/extension-runtime.ts`. Only loaded
  extension frames/workers in the shared session can invoke these operations.
- Use native WebContents IDs for extension tabs, and the browser's selected tab
  for active-tab queries. Redact URLs/titles without tabs or matching host permissions.
- Relay native storage invalidations to MV3 workers, whose storage events are
  missing in the tested Electron runtime. Workers re-read native values and
  deduplicate invalidations; the adapter never creates a separate vault store.
- Implement empty, read-only managed storage; additional optional permissions
  are not granted. Cloud `storage.sync`, native messaging/biometrics, extension
  keyboard shortcuts and full Chrome API parity are outside the current scope.

Validation on 2026-09-13 used Electron 44.3.0 and the unmodified CWS Bitwarden
2026.8.0 against a disposable local Vaultwarden 1.37.2 account on Linux and native
Windows. Password/authenticator-code login, sync, editing an existing password,
generation, creating a login, popup filling on two hosts and in a same-origin
iframe, no suggestions on an unrelated host, and restart/lock/unlock/fill passed.
An actual 2026.3.0 → 2026.8.0 upgrade also passed expanded-permission approval,
stable runtime identity, retained account/vault, unlock and fill.
Cloud accounts and cross-origin iframe variants have not been exercised with this
fixture. Passkeys and biometrics are outside the supported boundary.

A narrow navigation limitation remains: editing an item immediately after creating
it in the same popup session saves the change but can leave the popup on the Edit
screen. Closing the popup and changing tabs restores ordinary navigation. Tracing
shows the write completes and Bitwarden's popup route cache redirects back to Edit;
this has not been reproduced in stock Chrome, so its origin remains unconfirmed.
Vendor code is unchanged. Ordinary existing-item editing and creation pass the
acceptance scenario in `e2e/scenarios/bitwarden.spec.ts`.

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
