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
- **IPC**: Type-safe wrapper with zod validation

## Architecture

### Process Model
```
┌─────────────────────────────────────────────────────────┐
│                     Main Process                         │
│  - Window management                                     │
│  - Keyboard shortcuts (global + app)                     │
│  - Download handling                                     │
│  - Extension host                                        │
│  - System tray/native menus                              │
│  - SQLite database                                       │
└─────────────────────────────────────────────────────────┘
           │ IPC (type-safe)
           ▼
┌─────────────────────────────────────────────────────────┐
│                   Browser Chrome (Renderer)              │
│  - React app                                             │
│  - Sidebar (Arc-style tab organization)                  │
│  - Command palette (Cmd+K/Ctrl+K to invoke)              │
│  - Spaces/folders for tab organization                   │
│  - Settings UI                                           │
│  - Minimal chrome, content-first                         │
└─────────────────────────────────────────────────────────┘
           │ manages
           ▼
┌─────────────────────────────────────────────────────────┐
│              WebContentsView (per tab)                   │
│  - Actual web page content                               │
│  - Isolated from browser chrome                          │
│  - Chrome extension content scripts run here             │
└─────────────────────────────────────────────────────────┘
```

### Directory Structure
```
src/
├── main/                    # Main process
│   ├── index.ts            # Entry point
│   ├── windows/            # Window management
│   ├── keyboard/           # Shortcut handling
│   ├── downloads/          # Download manager
│   ├── extensions/         # Extension host
│   ├── storage/            # SQLite + settings
│   └── ipc/                # IPC handlers
├── renderer/               # Browser chrome (React)
│   ├── index.html
│   ├── main.tsx
│   ├── components/
│   │   ├── Sidebar/           # Arc-style sidebar with tabs
│   │   ├── CommandPalette/    # Action dialog (Cmd+K)
│   │   ├── TabItem/           # Individual tab (pinned/bookmark/ephemeral)
│   │   ├── Workspace/         # Workspace container
│   │   └── Settings/
│   ├── hooks/
│   ├── stores/             # Zustand or similar
│   └── styles/
├── preload/                # Preload scripts
│   ├── chrome.ts           # Browser chrome preload
│   └── content.ts          # Web content preload
├── shared/                 # Shared types/utils
│   ├── types/
│   └── ipc-schema.ts       # Type-safe IPC definitions
└── extensions/             # Extension system integration
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

### 2. Command Palette (Arc-inspired)
- Invoke with `Cmd+K` / `Ctrl+K` (configurable)
- **Features**:
  - Navigate to URL directly
  - Search with bang syntax: `!g query` (Google), `!gh query` (GitHub), `!ddg query` (DuckDuckGo)
  - Quick actions: new tab, close tab, settings, etc.
  - Search open tabs
  - Search history/bookmarks
- **Configurable search providers** stored in settings:
  ```typescript
  searchProviders: {
    'g': { name: 'Google', url: 'https://google.com/search?q=%s' },
    'gh': { name: 'GitHub', url: 'https://github.com/search?q=%s' },
    'ddg': { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  }
  ```
- Default search (no bang): configurable, defaults to DuckDuckGo

### 3. Arc-style Sidebar & Tab Model
- Vertical tab list (no horizontal tab bar)
- Workspaces for organizing tabs
- Collapsible sidebar
- Drag-and-drop reordering

**Three Tab Types**:
1. **Pinned tabs** - Global, always visible across workspaces, persist forever
2. **Bookmark tabs** - Workspace-specific, persist forever until manually removed
3. **Ephemeral tabs** - Workspace-specific, auto-removed if older than 8 hours on startup

```typescript
// Tab schema
interface Tab {
  id: string;
  type: 'pinned' | 'bookmark' | 'ephemeral';
  workspaceId: string | null;  // null for pinned (global)
  url: string;
  title: string;
  position: number;
  sessionPartition: string | null;
  createdAt: Date;
  lastAccessedAt: Date;
}
```

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

### 8. Storage

**Local (SQLite + JSON)**:
```typescript
// SQLite tables
- history(id, url, title, visit_time, visit_count)
- downloads(id, url, path, state, progress, created_at)
- tabs(id, workspace_id, type, url, title, position, session_partition, created_at, last_accessed_at)
- workspaces(id, name, color, position)

// JSON files
- settings.json (user preferences, search providers)
- shortcuts.json (keyboard bindings)
- extensions.json (installed extensions list)
```

**Cloud (Convex - optional, future)**:
- Selective sync for cross-device features
- Navigation history with metadata
- Bookmarks sync
- User preferences sync

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

**5. State Management**
- Zustand vs Jotai vs React Context
- Consider React Compiler compatibility
- Need to handle: tabs, workspaces, settings, history, downloads

**6. IPC Architecture**
- Type-safe IPC wrapper design
- Batching strategy for performance
- Error handling across process boundary

**7. Tab Lifecycle Management**
- When to truly destroy vs hibernate tabs?
- Memory thresholds for tab eviction?
- How to handle tab restoration after eviction?

**8. Multi-Window Architecture**
- Shared state across windows?
- Which window "owns" pinned tabs?
- Window position/size persistence

### Nice to Have (Can Defer)

**9. macOS/Linux Support**
- Default browser registration on macOS (LSHandlers)
- Linux desktop integration (.desktop files)
- Platform-specific UI considerations

**10. Performance Baselines**
- Startup time target?
- Memory per tab target?
- Acceptable command palette latency?

**11. Testing Strategy**
- E2E testing for Electron (Playwright? Spectron?)
- Unit testing for React components
- Extension compatibility testing automation

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
