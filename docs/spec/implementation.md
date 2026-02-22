# Key Implementation Details

## 1. Window & Tab Management

- Use `BrowserWindow` with `WebContentsView` (not deprecated `BrowserView`)
- Each tab = one `WebContentsView` attached to window
- Tab switching = show/hide views, not destroy/create
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

Extensions are **opt-in/experimental**. Don't rely on them for critical functionality — the ecosystem is not mature enough (~30-40% Chrome API coverage).

**Native alternatives for critical needs:**

- **Ad blocking**: `@cliqz/adblocker-electron` (Ghostery). Native, fast, uses uBlock/EasyList filter lists. No extension needed.
- **Password managers**: 1Password/Bitwarden have OS-level autofill via accessibility APIs. Browser extensions for these don't work in Electron.
- **DevTools extensions**: React DevTools works natively via `session.loadExtension()`.

**Optional extension support** (via `electron-chrome-extensions` ^4.9 + `electron-chrome-web-store`):

- Load unpacked extensions
- CWS integration for `.crx` downloads + auto-updates
- Extension popup windows
- Content scripts injection
- Basic MV3 service workers (Electron 35+)

**Known limitations:**

- `declarativeNetRequest` not supported (MV3 ad blockers won't work)
- `chrome.storage.sync/managed` not supported
- `chrome.commands` (keyboard shortcuts) not supported
- Service workers are kept persistent (no idle/wake lifecycle)
- uBlock Origin (MV2 and Lite/MV3): does not work
- 1Password, Bitwarden: do not work

## 7. Tab Lifecycle Management

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

## 8. Multi-Window Architecture

Main process is authoritative. Each renderer window gets projected Zustand stores synced via IPC.

**Bus topology:** Single command bus + single event bus in main process. Each window renderer gets a thin IPC proxy. Commands carry `windowId` for routing. Events broadcast to all windows.

**Tab ownership:**

- **Pinned tabs**: global, shown in all windows' sidebars. WebContentsView reparented between windows on activation (`removeChildView` → `addChildView`, no recreation).
- **Bookmarked tabs**: per-workspace, owned by one window at a time.
- **Ephemeral tabs**: per-workspace, owned by one window.

**Window state persistence:** `electron-window-state` package. Per-window state stored in RxDB `window-state` collection keyed by `windowId` (x, y, width, height, maximized, activeWorkspaceId). Migrate to native Electron window state API when RFC #16 ships.

## 9. Optimistic UI Updates

IPC round-trip is ~0.08ms — most actions don't need optimistic updates. Use selectively:

| Pattern                                       | Actions                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Always optimistic** (renderer-only)         | Sidebar toggle, folder expand/collapse, tab reorder during drag                                    |
| **Optimistic + confirm**                      | Tab activate, bookmark toggle                                                                      |
| **Hybrid** (highlight optimistic, data waits) | Workspace switch (highlight workspace immediately, tab list waits for `workspaces:switched` event) |
| **Wait for main** (with loading indicator)    | Tab create, tab close (mark as "closing"), URL navigation, workspace CRUD                          |

**Reconciliation:** Track optimistic state in a separate `_optimistic` layer in Zustand stores. Events always overwrite confirmed state and clear corresponding optimistic overrides. No explicit rollback logic — if main rejects, the event carries the corrected value. Commands use `send` (fire-and-forget), responses come as events.

## 10. Sidebar Composition

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

## 11. Performance Optimizations

- Lazy load tabs (don't render until focused)
- Limit concurrent WebContentsViews
- Use `v8-compile-cache` for faster startup
- Minimize IPC traffic (batch updates)
- Background tab throttling

## 12. Storage (Data Abstraction)

All persistence goes through the `DataStore` interface. Each feature owns its RxDB collection schema and provides migrations. Features never touch RxDB or the filesystem directly.

**RxDB** runs in the main process using the free Filesystem RxStorage. Provides:

- Reactive observable queries (feed directly into Zustand stores via subscriptions)
- MongoDB-like query syntax (no SQL)
- JSON Schema-based validation with TypeScript inference
- Built-in schema migrations, encryption, compression

**Summary of persisted data**:

```
RxDB collections: history, downloads, tabs, workspaces, pinned-tabs,
                  tab-customizations, domain-customizations, window-state
JSON files:       settings.json, shortcuts.json, extensions.json
```

**Cloud sync (Convex — optional)**: All data is local-only by default. Convex can be added as a separate optional data store for selective cross-device sync (bookmarks, workspace definitions, user preferences). Convex is not a sync layer for RxDB — it's an independent store for data the user opts to sync. Local RxDB remains the source of truth; synced data is mirrored to/from Convex when connected.
