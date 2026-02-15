# Chiaroscuro Browser - Specification Document

**Status**: Planning / Research phase - not ready for implementation

## Overview

Personal TypeScript browser built on Electron with Chrome extension support, React UI, and full UX control. **Arc Browser-inspired design** with command palette navigation instead of traditional address bar.

## Tech Stack

- **Runtime**: Electron (Chromium + Node.js)
- **Package manager**: Bun
- **Language**: TypeScript (strict mode)
- **UI**: React 19 + React Compiler + Vite
- **Components**: shadcn/ui
- **Styling**: Tailwind CSS 4
- **Storage**: RxDB (free filesystem storage) for structured data, JSON for settings
- **Ad blocking**: `@cliqz/adblocker-electron` (Ghostery) — native, no extension needed
- **Extensions**: `electron-chrome-extensions` ^4.9 (opt-in/experimental, ~30-40% Chrome API coverage)
- **IPC**: Command bus + event bus with typed registries (bridges IPC transparently)

## Architecture

Features are the organizing unit. Each feature handles commands, emits events, owns its state, and accesses browser capabilities + storage through abstractions. 19 feature specs live in `docs/features/`.

```
Features (19, see docs/features/)
    ↕ send commands, listen to events
Command Bus + Event Bus
    ↕ bridge IPC transparently
Abstraction Layer
  ├── Platform (wraps Electron/Chromium)
  └── Data (wraps RxDB/JSON)
    ↕
Electron / Chromium
```

### Platform Abstraction

Interface wrapping WebContentsView management, sessions, windows, keyboard shortcuts, downloads, clipboard, and shell access. Two implementations:

- **`ElectronPlatform`** — production, delegates to real Electron APIs
- **`MockPlatform`** — tests, in-memory simulation

### Data Abstraction

Interface wrapping RxDB + JSON storage. RxDB provides reactive NoSQL document collections with MongoDB-like queries — no SQL. Per-feature collections with schema validation and migrations. Two implementations:

- **`RxDBDataStore`** — production, backed by RxDB with free Filesystem RxStorage (main process) + JSON files for settings
- **`InMemoryDataStore`** — tests, RxDB Memory RxStorage, no filesystem

### Command Bus

Routes named commands to a single handler each. Commands are imperative; exactly one handler per command name.

```typescript
bus.handle("tabs:create", handler); // register
bus.send("tabs:create", { url }); // invoke
```

### Event Bus

Pub/sub for outcome events. Events are past-tense; zero or more listeners.

```typescript
bus.on("tabs:created", listener); // subscribe
bus.emit("tabs:created", { tab }); // publish
```

Both buses bridge the IPC boundary transparently — features don't know which process they're talking to.

### Process Boundary

Features span main + renderer via up to 3 files:

- **`feature.main.ts`** — main-process logic (platform calls, data access, command handlers)
- **`feature.renderer.tsx`** — renderer logic (React state, UI components)
- **`feature.shared.ts`** — shared types, command/event names, payload schemas

### Strong Typing for Commands & Events

Command/event names and payloads are TypeScript types in each feature's `.shared.ts`. The bus is generic over a type registry so `bus.send('tabs:create', payload)` is compile-time checked — misspelled names or wrong payloads are type errors. Registry built by merging each feature's command/event type maps.

### Feature Registration & Startup

Features are registered via a manual list in entry points (explicit, no magic). Startup is two-phase:

1. **Register** — all features register command handlers, event listeners, key bindings, and other passive setup. No side effects.
2. **Start** — all features begin active logic (publishing events, loading persisted state, etc.). Only runs after every feature completes phase 1.

This guarantees all handlers are wired before any events flow.

### Testability

Three tiers:

- **Unit tests** — feature tested with MockPlatform + InMemoryDataStore (RxDB Memory RxStorage). No Electron dependency. Verify command handling and event emission in isolation.
- **Integration tests** — multiple features wired together with mocks. Verify cross-feature command/event flows.
- **E2E tests** — real Electron app. Cover user workflows from feature specs (e.g. "Open a page", "Switch workspace", "Bookmark the current tab"). Full stack from UI through platform to persisted state.

### Directory Structure

```
src/
├── features/           # 19 feature modules
│   ├── tabs/          # .main.ts, .renderer.tsx, .store.ts, .shared.ts, .test.ts
│   ├── workspaces/
│   ├── command-palette/
│   └── ...            # one dir per feature
├── platform/          # Platform interface + ElectronPlatform + MockPlatform
├── data/              # DataStore interface + RxDBDataStore + InMemoryDataStore
├── bus/               # CommandBus + EventBus + IPC bridge
├── main/              # Entry point, feature wiring
├── renderer/          # React root, Shell layout, shared UI primitives
├── preload/           # Preload scripts (expose bus over IPC)
└── shared/            # Cross-cutting types
```

### React Component Organization

Three layers separate layout, feature UI, and shared primitives:

- **`renderer/Shell.tsx`** — Thin layout skeleton. Imports feature components and slots them into a CSS grid. No business logic.
- **Feature components** — Each feature's `.renderer.tsx` exports its React components (e.g. `<Sidebar />`, `<CommandPalette />`, `<TitleBar />`). These live with their feature, not in a shared folder.
- **`renderer/components/`** — Shared UI primitives beyond shadcn (drag handles, keyboard shortcut display, etc.).

```tsx
// Shell.tsx — dumb layout, composes feature components
<div className="grid grid-rows-[auto_1fr] grid-cols-[auto_1fr]">
  <TitleBar /> {/* custom-window-chrome */}
  <Sidebar /> {/* sidebar — contains tabs, folders, workspaces */}
  <ContentArea /> {/* WebContentsView host */}
  <CommandPalette /> {/* command-palette — overlay */}
  <FindBar /> {/* find-text — overlay */}
</div>
```

### Feature ↔ UI Communication

Each feature has a **renderer-side Zustand store** (`feature.store.ts`) holding UI-relevant state. One store per feature, not a global store.

Features distinguish two kinds of state:

- **Authoritative state** (tab list, active workspace, settings) — owned by main process, synced to renderer store via bus events
- **Ephemeral UI state** (drag position, input text, animation state) — renderer-only, lives in Zustand store or React local state, never synced to main

**Three communication paths:**

**1. Main → Renderer (state push):**
Main-process feature handles a command, emits an event. The renderer store listens for events and updates. Components subscribe to the store via hooks — synchronous React reads, no IPC round-trip on render.

```
tabs.main.ts                  IPC bridge              tabs.store.ts
  handles tabs:create  →  emits tabs:created  →  store.onTabCreated()
  owns authoritative state                        holds UI-optimized copy
```

**2. Renderer → Main (user actions):**
UI interactions call action functions that dispatch commands on the bus. Command crosses IPC → main handler → emits event → store updates → React re-renders.

```tsx
// tabs.renderer.tsx
function TabItem({ tab }) {
  const bus = useCommandBus();
  return (
    <button onClick={() => bus.send("tabs:activate", { tabId: tab.id })}>
      {tab.title}
    </button>
  );
}
```

**3. Cross-feature renderer reads:**
Features may import another feature's store for read-only access (e.g. sidebar reads workspace store). All writes go through commands so main process stays authoritative.

Rule: **features export read-only selector hooks from their store; all mutations go through commands.**

```tsx
// sidebar.renderer.tsx — reads from workspaces feature
import { useWorkspacesStore } from "../workspaces/workspaces.store";

function WorkspaceList() {
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  // ...render, but mutations go through bus.send('workspaces:switch', ...)
}
```

## Key Implementation Details

### 1. Window & Tab Management

- Use `BrowserWindow` with `WebContentsView` (not deprecated `BrowserView`)
- Each tab = one `WebContentsView` attached to window
- Tab switching = show/hide views, not destroy/create
- Multi-window support from day 1
- **Per-tab session isolation**: Use `session.fromPartition('persist:tab-{id}')` for isolated tabs
  - Default: shared session
  - Toggle per-tab to create isolated session (like incognito but persistent if desired)

### 2. Command Palette

See `docs/features/CommandPaletteFeature.specs.md` for full spec.

### 3. Sidebar & Tab Model

See `docs/features/SidebarFeature.specs.md`, `docs/features/TabsFeature.specs.md`, `docs/features/PinnedTabsFeature.specs.md`.

### 4. Keyboard Shortcuts

- `globalShortcut` for system-wide shortcuts
- `Menu` accelerators for app shortcuts
- Custom shortcut registry with rebinding support
- Vim-style keybindings optional

### 5. Download Handling

- Intercept via `session.on('will-download')`
- Custom download folder selection per-download or default
- Download progress in UI
- Pause/resume/cancel support

### 6. Chrome Extension Support

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

### 7. Tab Lifecycle Management

Three-tier lifecycle: **active → suspended → evicted**. Thresholds are user-configurable via the Settings feature.

**States:**
| State | What happens | Cost |
|---|---|---|
| Active/Hidden | WebContentsView exists, renderer throttled by Chromium | Full memory |
| Suspended | `backgroundThrottling` keeps timers/network idle, page stays in memory | Full memory, ~0 CPU |
| Evicted | `webContents.close()` called, only metadata + screenshot retained | < 15 MB |

**Default eviction policy (configurable in Settings):**

- **Pinned tabs**: never evict, only throttle
- **Bookmarked tabs**: evict after 30min inactive when available RAM < 25%
- **Ephemeral tabs**: evict after 15min inactive when available RAM < 25%
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

### 8. Multi-Window Architecture

Main process is authoritative. Each renderer window gets projected Zustand stores synced via IPC.

**Bus topology:** Single command bus + single event bus in main process. Each window renderer gets a thin IPC proxy. Commands carry `windowId` for routing. Events broadcast to all windows.

**Tab ownership:**

- **Pinned tabs**: global, shown in all windows' sidebars. WebContentsView reparented between windows on activation (`removeChildView` → `addChildView`, no recreation).
- **Bookmarked tabs**: per-workspace, owned by one window at a time.
- **Ephemeral tabs**: per-workspace, owned by one window.

**Window state persistence:** `electron-window-state` package. Per-window state stored in RxDB `window-state` collection keyed by `windowId` (x, y, width, height, maximized, activeWorkspaceId). Migrate to native Electron window state API when RFC #16 ships.

### 9. Optimistic UI Updates

IPC round-trip is ~0.08ms — most actions don't need optimistic updates. Use selectively:

| Pattern                                       | Actions                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Always optimistic** (renderer-only)         | Sidebar toggle, folder expand/collapse, tab reorder during drag                                    |
| **Optimistic + confirm**                      | Tab activate, bookmark toggle                                                                      |
| **Hybrid** (highlight optimistic, data waits) | Workspace switch (highlight workspace immediately, tab list waits for `workspaces:switched` event) |
| **Wait for main** (with loading indicator)    | Tab create, tab close (mark as "closing"), URL navigation, workspace CRUD                          |

**Reconciliation:** Track optimistic state in a separate `_optimistic` layer in Zustand stores. Events always overwrite confirmed state and clear corresponding optimistic overrides. No explicit rollback logic — if main rejects, the event carries the corrected value. Commands use `send` (fire-and-forget), responses come as events.

### 10. Sidebar Composition

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

### 11. Performance Optimizations

- Lazy load tabs (don't render until focused)
- Limit concurrent WebContentsViews
- Use `v8-compile-cache` for faster startup
- Minimize IPC traffic (batch updates)
- Background tab throttling

### 12. Storage (Data Abstraction)

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

## Project Phases

### Phase 0: Research & Prototyping ✓

1. ~~Test electron-chrome-extensions~~ → Extensions are opt-in/experimental; use native ad blocking + OS-level password managers
2. ~~Evaluate electron-builder vs Electron Forge~~ → electron-builder (Bun compat, built-in updater, cross-compilation)
3. ~~Verify Tailwind 4 + shadcn compatibility~~ → Fully compatible since Feb 2025
4. Prototype basic Electron + React 19 + Vite setup with Bun
5. ~~Test better-sqlite3 native module compilation~~ → Replaced with RxDB (pure JS, no native modules)

### Phase 1: Foundation

1. Project setup (Electron + Vite + React 19 + TypeScript + Bun)
2. shadcn/ui + Tailwind 4 configuration
3. Basic window with single WebContentsView
4. Type-safe IPC layer
5. Basic keyboard shortcut handling

### Phase 2: Command Palette & Navigation

1. Command palette component (modal overlay)
2. URL navigation
3. Search provider system with bang syntax
4. Back/forward/refresh controls

### Phase 3: Sidebar & Tabs

1. Arc-style sidebar component
2. Three-tier tab model (pinned, bookmark, ephemeral)
3. Multi-tab support (create, close, switch, reorder)
4. Workspaces for tab organization
5. Tab persistence + 8hr ephemeral cleanup on startup
6. Keyboard navigation (Ctrl+T, Ctrl+W, Ctrl+Tab, etc.)

### Phase 4: Core Features

1. Per-tab session isolation toggle
2. History search in command palette
3. Bookmarks (integrated into command palette + sidebar)
4. Downloads with custom folder selection
5. Settings page
6. Keyboard shortcut customization

### Phase 5: Extensions

1. Integrate electron-chrome-extensions
2. Extension management UI
3. Load unpacked + .crx support
4. Extension popup support

### Phase 6: Distribution & Updates

1. electron-builder config for Windows/macOS/Linux
2. Default browser registration (Windows registry, protocol handlers)
3. External application protocol handler support (OAuth callbacks, deep links from other apps)
4. GitHub Actions release workflow (build on tag push)
5. electron-updater integration (check for updates, auto-install)

### Phase 7: Polish

1. Performance profiling & optimization
2. Theming
3. Error handling & crash recovery
4. Convex sync integration (if desired)

## Dependencies (key packages)

```json
{
  "electron": "^35.0.0",
  "electron-updater": "^6.x",
  "electron-chrome-extensions": "^4.9",
  "electron-chrome-web-store": "^0.13",
  "@cliqz/adblocker-electron": "^1.34",
  "rxdb": "^16.x",
  "rxdb-utils": "^2.x",
  "react": "^19.x",
  "babel-plugin-react-compiler": "^19.x",
  "tailwindcss": "^4.x",
  "zustand": "^5.x",
  "zod": "^3.x"
}
```

**Dev dependencies**: `electron-builder` ^26.x, `electron-vite`
**Tailwind**: Use `@tailwindcss/vite` plugin (set `"moduleResolution": "bundler"` in tsconfig). Fallback: `@tailwindcss/postcss`.
**shadcn/ui**: `bunx shadcn@latest init` (supports TW4 natively; may need `vite.config.js` symlink for electron-vite detection)
**Zustand**: Use inline selectors (`useStore(s => s.field)`), avoid auto-generated selectors. Use `useShallow` for multi-field selections.
**RxDB**: Free Filesystem RxStorage for main process, Memory RxStorage for tests. No native modules required — pure JS.

## Build & Distribution

- `electron-builder` for packaging
- Target: Linux, macOS, Windows

### Default Browser (Windows)

- Register as default browser via `electron-builder` config
- Handle `http://`, `https://` protocol associations
- Register file associations (`.html`, `.htm`, etc.)
- Windows registry entries added during install

### External Application Protocol Support

- Handle protocol launches from other applications (e.g. `myapp://oauth/callback`)
- Register as a protocol handler for configured schemes so OAuth/login flows in external apps can redirect back to the browser
- Forward protocol URLs to the appropriate tab or open a new one

### Auto-Update Infrastructure

```
Git tag (v1.0.0) → GitHub Actions → Build artifacts → GitHub Releases
                                                           ↓
                           Browser ← electron-updater ← Release assets
```

**Flow**:

1. Push git tag (`git tag v1.0.0 && git push --tags`)
2. GitHub Actions workflow triggers on tag push
3. Builds for Windows/macOS/Linux via `electron-builder`
4. Uploads artifacts to GitHub Releases
5. `electron-updater` in browser checks releases periodically
6. Downloads + installs update, prompts user to restart

**Required**:

- GitHub Actions workflow (`.github/workflows/release.yml`)
- `electron-updater` config in `electron-builder.yml`
- Code signing (recommended for Windows/macOS, can skip for personal use)

## Resolved Decisions

- **Sessions**: Shared by default, per-tab isolation toggle available
- **DevTools**: Standard Chromium DevTools (no custom enhancements initially)
- **Navigation**: Arc-style command palette with bang syntax (`!g`, `!gh`, etc.), no persistent address bar
- **Sync**: Local-first (RxDB). Optional Convex as separate sync store for selected data (bookmarks, workspace defs, preferences). Convex is independent, not an RxDB sync layer — local RxDB remains source of truth
- **Search**: Configurable providers via bang syntax, DuckDuckGo as default
- **Tab persistence**: Three-tier model (pinned=global/forever, bookmark=workspace/forever, ephemeral=workspace/8hr TTL)
- **Extension storage**: Let Electron handle via built-in partition (simplest approach)
- **Updates**: Auto-update via electron-updater + GitHub Releases, triggered by git tags
- **Default browser**: Windows registry registration for http/https protocols
- **IPC architecture**: Command bus + event bus bridging IPC transparently; strong-typed with per-feature type registries
- **Testing strategy**: MockPlatform + InMemoryDataStore (RxDB Memory RxStorage) for feature unit tests; integration tests with multiple features + mocks; E2E with real Electron
- **Chrome extensions**: Opt-in/experimental via `electron-chrome-extensions` ^4.9. ~30-40% API coverage, no MV3 `declarativeNetRequest`. Use `@cliqz/adblocker-electron` for ad blocking, OS-level autofill for password managers, `session.loadExtension()` for DevTools extensions.
- **Build tooling**: `electron-builder` ^26 + `electron-vite`. Forge doesn't support Bun, has experimental Vite plugin. electron-builder has built-in `electron-updater`, better cross-compilation, more CI examples.
- **Tailwind 4 + shadcn**: Fully compatible since Feb 2025. Use `@tailwindcss/vite` plugin with `"moduleResolution": "bundler"`. Requires Electron 24+ (Chrome 112+).
- **Storage**: RxDB (free Filesystem RxStorage) for structured data, JSON for settings. No SQL. All local-only by default; optional Convex sync for selected data (future). No native modules required — pure JS, no `@electron/rebuild` needed for storage.
- **State management**: Zustand v5, one store per feature. Inline selectors (`useStore(s => s.field)`) work with React Compiler. Avoid auto-generated selectors (`.use.bears()`). Use `useShallow` for multi-field.
- **Tab lifecycle**: Three-tier (active → suspended → evicted). Configurable thresholds in Settings. Screenshot + nav history preserved on eviction, `navigationHistory.restore()` on focus.
- **Multi-window**: Main-process authoritative, single bus, renderer projections via IPC. Pinned tabs global + reparented between windows. `electron-window-state` for persistence.
- **Optimistic UI**: Selective — sidebar toggle/drag are renderer-only; tab activate/bookmark toggle are optimistic+confirm; tab create/close wait for main. `_optimistic` layer in Zustand for reconciliation.
- **Sidebar composition**: Direct imports (Option A). Matches existing cross-feature store import pattern. Migrate to slots only if plugin system is added.
- **Performance baselines**: Cold start < 2s, memory/tab < 80MB, command palette < 50ms, IPC < 1ms, tab switch < 100ms

## Performance Targets

| Metric                   | Target           | Stretch  |
| ------------------------ | ---------------- | -------- |
| Cold startup             | < 2s             | < 1s     |
| Warm startup             | < 1s             | < 500ms  |
| Memory per active tab    | < 80 MB          | < 50 MB  |
| Memory per evicted tab   | < 15 MB          | < 5 MB   |
| Memory total (10 tabs)   | < 1 GB           | < 600 MB |
| Command palette open     | < 50ms           | < 30ms   |
| Palette filter/keystroke | < 16ms (1 frame) | < 8ms    |
| IPC round-trip           | < 1ms            | < 0.2ms  |
| Tab switch (show/hide)   | < 100ms          | < 50ms   |

## Deferred Questions

**macOS/Linux Support** (defer to Phase 6):

- Default browser registration on macOS (LSHandlers)
- Linux desktop integration (.desktop files)
- Platform-specific UI considerations

### Known Limitations (Accept for Now)

- **Code signing**: Skipped for now, accept warnings
- **Electron bundle size**: ~200MB, acceptable for desktop app
- **Chrome extension compatibility**: ~30-40% of APIs; document what works and what doesn't

## Verification (Post-Implementation)

1. **Build**: `bun run dev` starts Electron with hot-reload
2. **Test navigation**: Open command palette, navigate to URLs, test bang syntax
3. **Test tabs**: Create/close tabs, switch workspaces, verify persistence
4. **Test ad blocking**: Verify `@cliqz/adblocker-electron` blocks ads on major sites
5. **Test extensions**: Load React DevTools via `session.loadExtension()`, optionally test CWS extensions
6. **Test downloads**: Download file, verify folder selection dialog
7. **Test tab lifecycle**: Verify eviction after configured timeout, restoration with screenshot placeholder
8. **Test multi-window**: Open second window, verify pinned tabs shown in both, tab reparenting works
9. **Test performance**: Cold start < 2s, 10-tab memory < 1GB, command palette < 50ms
