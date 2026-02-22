# Project Phases

## Phase 0: Research & Prototyping ✓

1. ~~Test electron-chrome-extensions~~ → Extensions are opt-in/experimental; use native ad blocking + OS-level password managers
2. ~~Evaluate electron-builder vs Electron Forge~~ → electron-builder (Bun compat, built-in updater, cross-compilation)
3. ~~Verify Tailwind 4 + shadcn compatibility~~ → Fully compatible since Feb 2025
4. ~~Prototype basic Electron + React 19 + Vite setup with Bun~~
5. ~~Test better-sqlite3 native module compilation~~ → Replaced with RxDB (pure JS, no native modules)

## Phase 1: Foundation

1. Project setup (Electron + Vite + React 19 + TypeScript + Bun)
2. shadcn/ui + Tailwind 4 configuration
3. Basic window with single WebContentsView
4. Type-safe IPC layer
5. Basic keyboard shortcut handling

## Phase 2: Command Palette & Navigation

1. Command palette component (modal overlay)
2. URL navigation
3. Search provider system with bang syntax
4. Back/forward/refresh controls

## Phase 3: Sidebar & Tabs

1. Arc-style sidebar component
2. Three-tier tab model (pinned, bookmark, ephemeral)
3. Multi-tab support (create, close, switch, reorder)
4. Workspaces for tab organization
5. Tab persistence + 8hr ephemeral cleanup on startup
6. Keyboard navigation (Ctrl+T, Ctrl+W, Ctrl+Tab, etc.)

## Phase 4: Core Features

1. Per-tab session isolation toggle
2. History search in command palette
3. Bookmarks (integrated into command palette + sidebar)
4. Downloads with custom folder selection
5. Settings page
6. Keyboard shortcut customization
7. Built-in page routing in command palette

## Phase 5: Extensions

1. Integrate electron-chrome-extensions
2. Extension management UI
3. Load unpacked + .crx support
4. Extension popup support

## Phase 6: Distribution & Updates

1. electron-builder config for Windows/macOS/Linux
2. Default browser registration (Windows registry, protocol handlers)
3. External application protocol handler support (OAuth callbacks, deep links from other apps)
4. GitHub Actions release workflow (build on tag push)
5. electron-updater integration (check for updates, auto-install)

## Phase 7: Polish

1. Performance profiling & optimization
2. Theming
3. Error handling & crash recovery
4. Convex sync integration (if desired)
