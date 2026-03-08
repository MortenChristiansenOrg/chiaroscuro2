# Feature Code Cleanup Plan

## Systemic Issues

### Module-level mutable state

Nearly every `.main.ts` uses module-scoped `let` vars + Maps set during `register()`. Problems: test isolation fragility, no GC, calling exports before `register()` silently fails or throws. Affected: app-state, domain-css, downloads, folders, local-web-app, pinned-tabs, settings, sidebar, tabs, terminal, workspaces, tab-customization.

### ~~Untyped `sendCommand` in renderers~~ ✅ DONE

~~Multiple renderers define `function sendCommand(name: string, payload: unknown)`, losing all compile-time safety.~~ Fixed: All renderers now use typed `sendCommand<K extends keyof UsedCommands>()` with `Pick<XyzCommands, ...>`. Applied to: downloads, find-text, installer, local-web-app, sidebar (all 5 extracted files), tab-customization, terminal.

### ~~`payload as XyzEvent` casts in all stores~~ ✅ DONE

~~Every store's `subscribeToEvents` callback casts `payload` from `unknown`.~~ Fixed: Created `typedOnEvent<TRegistry>()` utility in `src/shared/typed-on-event.ts`. Applied to all ~15 stores.

### ~~Direct mutation of Map-stored objects~~ ✅ DONE (folders, pinned-tabs, tab-customization)

~~Several features mutate objects retrieved from Maps before calling `.set()`.~~ Fixed in folders.main.ts (all 7 mutation sites → immutable spread), pinned-tabs.main.ts, tab-customization.main.ts. Remaining: tabs.main.ts (internal Map, mutations are within the same synchronous handler), domain-css.main.ts.

---

## Per-Feature Highlights (HIGH/MEDIUM)

| Feature               | Sev    | Issue                                                                                                | Status |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------- | ------ |
| **sidebar**           | HIGH   | God component — `sidebar.renderer.tsx` is ~1779 lines. Extract TabItem, FolderGroup, PinnedTabsStrip | ✅ DONE — 8 files extracted, main file ~310 lines |
| **sidebar**           | MEDIUM | Massive prop drilling (10-15+ props through tree). Needs DragContext/provider                        | SidebarDragContext created, not yet wired |
| **sidebar**           | MEDIUM | `useMemo` dep on `bookmarked` defeats memoization (new array ref every render)                       | ✅ DONE — `pinnedTabIds` memoized |
| **workspaces**        | HIGH   | Direct mutation of external Tab objects (`tab.workspaceId = ...`) violates "mutations via commands"  | ✅ DONE — uses TABS_SET_WORKSPACE command |
| **workspaces**        | HIGH   | `start()` exported standalone, not via `defineFeature` pattern                                       | |
| **workspaces**        | MEDIUM | `FadePresence` double-rAF without cancellation on unmount                                            | ✅ DONE |
| **command-palette**   | HIGH   | Contradictory boolean state (`visible`/`closing`) — should be status enum                            | ✅ DONE |
| **command-palette**   | MEDIUM | Effect cascade for open/close animation, blur/refocus focus trap                                     | |
| **command-palette**   | MEDIUM | Hard-coded command strings instead of shared constants                                               | |
| **folders**           | HIGH   | Zero test coverage for complex reorder/nesting logic                                                 | ✅ DONE — 24 tests covering all commands |
| **local-web-app**     | HIGH   | `useEffect` for state sync — project's #1 documented anti-pattern                                    | ✅ DONE — override pattern |
| **local-web-app**     | MEDIUM | Missing `await` on async `startProcess` calls                                                        | ✅ DONE |
| **local-web-app**     | MEDIUM | Duplicated process exit cleanup (close vs error handlers)                                            | |
| **tabs**              | MEDIUM | `as string` casts on platform event callbacks — unsafe if Electron API changes                       | |
| **tabs**              | MEDIUM | Fire-and-forget `fetchAsDataUrl` with no `.catch()`                                                  | ✅ DONE |
| **debug-server**      | HIGH   | Monkey-patching in `recorder.ts` with no double-registration guard                                   | ✅ DONE |
| **domain-css**        | HIGH   | Module-level mutable state + abbreviated `d` param in `register()`                                   | ✅ DONE |
| **domain-css**        | MEDIUM | Unhandled promise rejections in async `fs.watch` callback                                            | ✅ DONE |
| **downloads**         | MEDIUM | `useDownloadsStore((s) => s.downloads)` returns Map — needs `useShallow`                             | |
| **settings**          | MEDIUM | Fire-and-forget: 3 separate `dataStore.setSetting()` calls per save                                  | ✅ DONE |
| **tab-customization** | MEDIUM | Two `useEffect` for state sync (anti-pattern)                                                        | ✅ DONE — override pattern |
| **pinned-tabs**       | MEDIUM | `TABS_UPDATED` sync doesn't emit `PINNED_TABS_CHANGED` — renderer never learns                       | ✅ DONE |

---

## Best Practices Gap Analysis (2025-2026)

| Area                 | Current                                                    | Recommended                                                                                |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **`useEffectEvent`** | Manual ref-based "latest callback" patterns                | Now stable in React 19.2 — cleaner solution for stale closures in effects                  |
| **`<Activity>`**     | Manual show/hide for tab content                           | React 19.2's `<Activity mode="hidden">` preserves state, unmounts effects                  |
| **`forwardRef`**     | Likely still used in UI components                         | Deprecated in React 19 — use ref as regular prop                                           |
| **React Compiler**   | Docs mention it, manual `useCallback`/`useMemo` everywhere | Compiler 1.0 is production-ready — stop adding manual memo, remove `React.memo()` wrappers. Add lint rule requiring `// manual-memo: <reason>` comment for any `useCallback`/`useMemo`/`React.memo` usage. Run `react-compiler-healthcheck` to verify compiler coverage and identify components it can't optimize. |
| **TS 7.0 prep**      | Current TS config                                          | Audit for enums (use `as const` objects), `baseUrl` usage, `moduleResolution: "node"`      |
| **Zustand v5**       | Selectors returning objects/Maps                           | Stricter reference equality — use `useShallow` for multi-value selectors                   |
| **Vitest 4.0**       | jsdom-based tests                                          | Browser mode now stable — consider for component tests needing real DOM                    |

---

## Unresolved Questions

1. The `vi.mocked()` note in MEMORY.md says it's unavailable in bun test, but `dev-tools.test.ts` uses it — is the memory note stale, or do these tests run differently?
2. Several `settings.test.ts` test objects appear to be missing the `debugServer` field — do these actually compile?
3. ~~Is the sidebar's 1779-line renderer considered known tech debt, or should decomposition be prioritized?~~ Resolved: decomposed.
4. Is `<Activity>` worth exploring for the tab show/hide architecture, or is the current WebContentsView approach sufficient?
