# Decisions & Constraints

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

## Known Limitations (Accept for Now)

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
