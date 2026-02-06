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
- **Storage**: SQLite (better-sqlite3) for history/bookmarks, JSON for settings
- **Extensions**: `electron-chrome-extensions` package
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
  └── Data (wraps SQLite/JSON)
    ↕
Electron / Chromium
```

### Platform Abstraction

Interface wrapping WebContentsView management, sessions, windows, keyboard shortcuts, downloads, clipboard, and shell access. Two implementations:
- **`ElectronPlatform`** — production, delegates to real Electron APIs
- **`MockPlatform`** — tests, in-memory simulation

### Data Abstraction

Interface wrapping SQLite + JSON storage. Provides key-value access, tabular queries, and per-feature schema migrations. Two implementations:
- **`SqliteDataStore`** — production, backed by better-sqlite3 + JSON files
- **`InMemoryDataStore`** — tests, no filesystem

### Command Bus

Routes named commands to a single handler each. Commands are imperative; exactly one handler per command name.
```typescript
bus.handle('tabs:create', handler)   // register
bus.send('tabs:create', { url })     // invoke
```

### Event Bus

Pub/sub for outcome events. Events are past-tense; zero or more listeners.
```typescript
bus.on('tabs:created', listener)     // subscribe
bus.emit('tabs:created', { tab })    // publish
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
- **Unit tests** — feature tested with MockPlatform + InMemoryDataStore. No Electron dependency. Verify command handling and event emission in isolation.
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
├── data/              # DataStore interface + SqliteDataStore + InMemoryDataStore
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
  <TitleBar />           {/* custom-window-chrome */}
  <Sidebar />            {/* sidebar — contains tabs, folders, workspaces */}
  <ContentArea />        {/* WebContentsView host */}
  <CommandPalette />     {/* command-palette — overlay */}
  <FindBar />            {/* find-text — overlay */}
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
  return <button onClick={() => bus.send('tabs:activate', { tabId: tab.id })}>{tab.title}</button>;
}
```

**3. Cross-feature renderer reads:**
Features may import another feature's store for read-only access (e.g. sidebar reads workspace store). All writes go through commands so main process stays authoritative.

Rule: **features export read-only selector hooks from their store; all mutations go through commands.**

```tsx
// sidebar.renderer.tsx — reads from workspaces feature
import { useWorkspacesStore } from '../workspaces/workspaces.store';

function WorkspaceList() {
  const workspaces = useWorkspacesStore(s => s.workspaces);
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
Using `electron-chrome-extensions`:
- Load unpacked extensions
- Support `.crx` files from Chrome Web Store
- Extension popup windows
- Content scripts injection
- Background service workers
- Most chrome.* APIs

### 7. Performance Optimizations
- Lazy load tabs (don't render until focused)
- Limit concurrent WebContentsViews
- Use `v8-compile-cache` for faster startup
- Minimize IPC traffic (batch updates)
- Background tab throttling

### 8. Storage (Data Abstraction)

All persistence goes through the `DataStore` interface. Each feature owns its schema and provides migrations. The store exposes key-value and tabular access; features never touch SQLite or the filesystem directly.

**Summary of persisted data**:
```
SQLite tables: history, downloads, tabs, workspaces
JSON files:    settings.json, shortcuts.json, extensions.json
```

**Cloud (Convex — optional, future)**: selective sync for cross-device bookmarks, history, preferences.

## Project Phases

### Phase 0: Research & Prototyping
1. Test electron-chrome-extensions with critical extensions (uBlock, 1Password)
2. Evaluate electron-builder vs Electron Forge
3. Verify Tailwind 4 + shadcn compatibility
4. Prototype basic Electron + React 19 + Vite setup with Bun
5. Test better-sqlite3 native module compilation

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
3. Custom `chiaroscuro://` protocol handler
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
  "electron": "^29.0.0",
  "electron-updater": "^6.x",
  "electron-chrome-extensions": "^3.x",
  "better-sqlite3": "^9.x",
  "react": "^19.x",
  "babel-plugin-react-compiler": "^19.x",
  "tailwindcss": "^4.x",
  "zustand": "^4.x",
  "zod": "^3.x"
}
```
Note: shadcn/ui components added via `bunx shadcn@latest init`

## Build & Distribution
- `electron-builder` for packaging
- Target: Linux, macOS, Windows

### Default Browser (Windows)
- Register as default browser via `electron-builder` config
- Handle `http://`, `https://` protocol associations
- Register file associations (`.html`, `.htm`, etc.)
- Windows registry entries added during install

### Custom Protocol Handler
- Register `chiaroscuro://` protocol
- Handle app-specific URLs: `chiaroscuro://settings`, `chiaroscuro://extensions`, etc.
- Deep linking support

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
- **Sync**: Local-first with optional Convex for selective cloud sync (future)
- **Search**: Configurable providers via bang syntax, DuckDuckGo as default
- **Tab persistence**: Three-tier model (pinned=global/forever, bookmark=workspace/forever, ephemeral=workspace/8hr TTL)
- **Extension storage**: Let Electron handle via built-in partition (simplest approach)
- **Updates**: Auto-update via electron-updater + GitHub Releases, triggered by git tags
- **Default browser**: Windows registry registration for http/https protocols
- **IPC architecture**: Command bus + event bus bridging IPC transparently; strong-typed with per-feature type registries
- **Testing strategy**: MockPlatform + InMemoryDataStore for feature unit tests; integration tests with multiple features + mocks; E2E with real Electron

## Open Questions & Research Needed

### Critical (Must Resolve Before Implementation)

**1. Chrome Extension Compatibility**
- Which `electron-chrome-extensions` version is most stable?
- What percentage of Chrome APIs are supported?
- Test critical extensions: uBlock Origin, 1Password, Bitwarden, React DevTools
- Is Manifest V3 supported? (Most extensions migrating to MV3)
- Alternative: `electron-browser-shell` - more complete but complex

**2. Build Tooling**
- `electron-builder` vs `Electron Forge`
- Forge: official, integrated, opinionated
- Builder: flexible, widely used, more docs
- Need to evaluate for: auto-update support, code signing workflow, CI/CD integration

**3. Tailwind 4 + shadcn Compatibility**
- Does shadcn fully support Tailwind 4?
- Any migration issues or workarounds needed?
- Alternative: Stick with Tailwind 3 until ecosystem matures

**4. Native Module Strategy (better-sqlite3)**
- How to handle native module rebuilds on Electron updates?
- Test with Bun: any compatibility issues?
- Alternatives: sql.js (pure JS), libsql, or JSON files for MVP

### Important (Resolve During Early Development)

**5. ~~State Management~~ (Resolved)**
- **Decision: Zustand, one store per feature** — modular, aligns with feature architecture
- Still need to verify React Compiler compatibility with Zustand

**6. Tab Lifecycle Management**
- When to truly destroy vs hibernate tabs?
- Memory thresholds for tab eviction?
- How to handle tab restoration after eviction?

**7. Multi-Window Architecture**
- Shared state across windows?
- Which window "owns" pinned tabs?
- Window position/size persistence

**8. Optimistic UI Updates**
- When user acts (e.g. clicks a tab), should the renderer store update immediately before the main-process round-trip?
- Optimistic updates feel snappier but need a reconciliation pattern for when main process rejects/modifies the action
- Which actions warrant optimistic updates vs waiting for confirmation?

**9. Sidebar Composition Strategy**
- Sidebar visually contains workspace tabs, pinned tabs, folders — pieces owned by other features
- Option A: sidebar.renderer.tsx imports components from other features directly
- Option B: features register "sidebar slots" and sidebar renders them dynamically
- Slot pattern is more decoupled but adds complexity; direct imports match the "read-only cross-feature store" pattern

### Nice to Have (Can Defer)

**10. macOS/Linux Support**
- Default browser registration on macOS (LSHandlers)
- Linux desktop integration (.desktop files)
- Platform-specific UI considerations

**11. Performance Baselines**
- Startup time target?
- Memory per tab target?
- Acceptable command palette latency?

### Known Limitations (Accept for Now)

- **Code signing**: Skipped for now, accept warnings
- **Electron bundle size**: ~200MB, acceptable for desktop app
- **Not all Chrome extensions will work**: Document compatibility

## Verification (Post-Implementation)

1. **Build**: `bun run dev` starts Electron with hot-reload
2. **Test navigation**: Open command palette, navigate to URLs, test bang syntax
3. **Test tabs**: Create/close tabs, switch workspaces, verify persistence
4. **Test extensions**: Load uBlock Origin, verify content scripts work
5. **Test downloads**: Download file, verify folder selection dialog
