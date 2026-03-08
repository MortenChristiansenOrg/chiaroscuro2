# Feature Code Cleanup Plan

## Systemic Issues

### ~~Module-level mutable state~~ ✅ DONE

~~Nearly every `.main.ts` uses module-scoped `let` vars + Maps set during `register()`. Problems: test isolation fragility, no GC, calling exports before `register()` silently fails or throws.~~ Fixed: Created `featureState<T>()` utility in `src/shared/feature-state.ts` — typed init/get/reset with fail-fast on pre-register access. Applied to features with exported state: tabs, folders, pinned-tabs, workspaces, tab-customization. Added `teardown()` to domain-css (closes watchers, clears Maps) and terminal. Features without exported state (settings, sidebar, command-palette, etc.) already reset state in `register()`.

### ~~Untyped `sendCommand` in renderers~~ ✅ DONE

~~Multiple renderers define `function sendCommand(name: string, payload: unknown)`, losing all compile-time safety.~~ Fixed: All renderers now use typed `sendCommand<K extends keyof UsedCommands>()` with `Pick<XyzCommands, ...>`. Applied to: downloads, find-text, installer, local-web-app, sidebar (all 5 extracted files), tab-customization, terminal.

### ~~`payload as XyzEvent` casts in all stores~~ ✅ DONE

~~Every store's `subscribeToEvents` callback casts `payload` from `unknown`.~~ Fixed: Created `typedOnEvent<TRegistry>()` utility in `src/shared/typed-on-event.ts`. Applied to all ~15 stores.

### ~~Direct mutation of Map-stored objects~~ ✅ DONE

~~Several features mutate objects retrieved from Maps before calling `.set()`.~~ Fixed in folders.main.ts (all 7 mutation sites → immutable spread), pinned-tabs.main.ts, tab-customization.main.ts, domain-css.main.ts (4 mutation sites → immutable spread). Remaining: tabs.main.ts (internal Map, mutations are within the same synchronous handler — acceptable).

---

## Per-Feature Highlights (HIGH/MEDIUM)

| Feature               | Sev    | Issue                                                                                                | Status                                                            |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **sidebar**           | HIGH   | God component — `sidebar.renderer.tsx` is ~1779 lines. Extract TabItem, FolderGroup, PinnedTabsStrip | ✅ DONE — 8 files extracted, main file ~310 lines                 |
| **sidebar**           | MEDIUM | Massive prop drilling (10-15+ props through tree). Needs DragContext/provider                        | ✅ DONE — SidebarDragProvider wired, ~10 drilled props eliminated |
| **sidebar**           | MEDIUM | `useMemo` dep on `bookmarked` defeats memoization (new array ref every render)                       | ✅ DONE — `pinnedTabIds` memoized                                 |
| **workspaces**        | HIGH   | Direct mutation of external Tab objects (`tab.workspaceId = ...`) violates "mutations via commands"  | ✅ DONE — uses TABS_SET_WORKSPACE command                         |
| **workspaces**        | HIGH   | `start()` exported standalone, not via `defineFeature` pattern                                       | ✅ DONE                                                           |
| **workspaces**        | MEDIUM | `FadePresence` double-rAF without cancellation on unmount                                            | ✅ DONE                                                           |
| **command-palette**   | HIGH   | Contradictory boolean state (`visible`/`closing`) — should be status enum                            | ✅ DONE                                                           |
| **command-palette**   | MEDIUM | Effect cascade for open/close animation, blur/refocus focus trap                                     | ✅ DONE — 4 effects → 2                                           |
| **command-palette**   | MEDIUM | Hard-coded command strings instead of shared constants                                               | ✅ DONE — typed sendCommand + constants                           |
| **folders**           | HIGH   | Zero test coverage for complex reorder/nesting logic                                                 | ✅ DONE — 24 tests covering all commands                          |
| **local-web-app**     | HIGH   | `useEffect` for state sync — project's #1 documented anti-pattern                                    | ✅ DONE — override pattern                                        |
| **local-web-app**     | MEDIUM | Missing `await` on async `startProcess` calls                                                        | ✅ DONE                                                           |
| **local-web-app**     | MEDIUM | Duplicated process exit cleanup (close vs error handlers)                                            | ✅ DONE — extracted cleanupProcess()                              |
| **tabs**              | MEDIUM | `as string` casts on platform event callbacks — unsafe if Electron API changes                       | ✅ DONE — runtime type guards                                     |
| **tabs**              | MEDIUM | Fire-and-forget `fetchAsDataUrl` with no `.catch()`                                                  | ✅ DONE                                                           |
| **debug-server**      | HIGH   | Monkey-patching in `recorder.ts` with no double-registration guard                                   | ✅ DONE                                                           |
| **domain-css**        | HIGH   | Module-level mutable state + abbreviated `d` param in `register()`                                   | ✅ DONE                                                           |
| **domain-css**        | MEDIUM | Unhandled promise rejections in async `fs.watch` callback                                            | ✅ DONE                                                           |
| **downloads**         | MEDIUM | `useDownloadsStore((s) => s.downloads)` returns Map — needs `useShallow`                             | ✅ DONE — useShallow + array selector                             |
| **settings**          | MEDIUM | Fire-and-forget: 3 separate `dataStore.setSetting()` calls per save                                  | ✅ DONE                                                           |
| **tab-customization** | MEDIUM | Two `useEffect` for state sync (anti-pattern)                                                        | ✅ DONE — override pattern                                        |
| **pinned-tabs**       | MEDIUM | `TABS_UPDATED` sync doesn't emit `PINNED_TABS_CHANGED` — renderer never learns                       | ✅ DONE                                                           |

---

## Best Practices Gap Analysis (2025-2026)

| Area                 | Current                                                    | Status / Recommended                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`useEffectEvent`** | Manual ref-based "latest callback" patterns                | N/A — no ref-based callback patterns found in codebase                                                                                                                                                           |
| **`<Activity>`**     | Manual show/hide for tab content                           | Deferred — tab content uses WebContentsView (native), not React                                                                                                                                                  |
| **`forwardRef`**     | Likely still used in UI components                         | ✅ N/A — not used in codebase                                                                                                                                                                                    |
| **React Compiler**   | Docs mention it, manual `useCallback`/`useMemo` everywhere | ✅ DONE — removed all manual `useCallback`/`useMemo` from 10 renderer files. No `React.memo()` was in use. Compiler 1.0 handles memoization automatically.                                                      |
| **TS 7.0 prep**      | Current TS config                                          | ✅ N/A — no enums found, `moduleResolution: "bundler"` already set                                                                                                                                               |
| **Zustand v5**       | Selectors returning objects/Maps                           | ✅ DONE — `useShallow` applied to Map selectors in sidebar (tabs, folders) and terminal. Downloads was already done. Single-value `.get()` selectors don't need it.                                               |
| **Vitest 4.0**       | jsdom-based tests                                          | Deferred — browser mode consideration for future                                                                                                                                                                 |

---

## Unresolved Questions

1. The `vi.mocked()` note in MEMORY.md says it's unavailable in bun test, but `dev-tools.test.ts` uses it — is the memory note stale, or do these tests run differently?
2. Several `settings.test.ts` test objects appear to be missing the `debugServer` field — do these actually compile?
3. ~~Is the sidebar's 1779-line renderer considered known tech debt, or should decomposition be prioritized?~~ Resolved: decomposed.
4. Is `<Activity>` worth exploring for the tab show/hide architecture, or is the current WebContentsView approach sufficient?
