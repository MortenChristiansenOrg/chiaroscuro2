# Phases 1-3 Completion Plan

## Context

Phases 1-3 cover foundation, command palette + navigation, and sidebar + tabs. Phase 1 is complete. Phase 2 is ~80% and Phase 3 is ~50%. This plan splits the remaining work into 7 independently-shippable units. Built-in page routing (`/settings` in command palette) deferred to Phase 4 — phases.md will be updated.

---

## Unit 1: Data Persistence Foundation

**Goal**: Implement the `DataStore` interface with RxDB so all subsequent units can persist their data independently.

**Files to create/modify**:
- `src/data/store.ts` — RxDB-backed DataStore implementation
- `src/data/index.ts` — export concrete store (currently exports types only)
- `src/main/index.ts` — initialize DataStore on startup, destroy on shutdown
- `package.json` — add `rxdb`, `rxdb-storage-filesystem` deps

**Key details**:
- Implement `Collection<T>` wrapping RxDB collections (findOne, findMany, insert, update, remove, observe)
- Implement `getSetting`/`setSetting` backed by a JSON file (per spec in `src/data/types.ts`)
- `initialize()` creates RxDB database + filesystem storage in app userData dir
- `destroy()` closes database on app quit
- Schema-less collections (RxDB schemaless mode or loose schema) — each feature defines its own doc shape
- Expose DataStore to features via dependency injection or singleton
- **In-memory DataStore implementation** (`src/data/memory-store.ts`) — same interface, backed by plain Maps. Used by all feature tests.

**Verification**: Unit tests for both RxDB and in-memory implementations — insert/query/observe docs, read/write settings, destroy cleanly.

---

## Unit 2: Tab Persistence & Ephemeral Cleanup

**Goal**: Tabs survive app restart. Ephemeral tabs >8hrs old auto-removed on startup.

**Files to modify**:
- `src/features/tabs/tabs.shared.ts` — add persistence-related types (serialized tab shape with `lastAccessedAt`)
- `src/features/tabs/tabs.main.ts` — save tab state on changes, restore on startup, ephemeral cleanup
- `src/platform/electron.ts` — may need hooks for restoring WebContentsView from saved URLs

**Key details**:
- Save to DataStore collection `tabs`: `{ id, url, title, favicon, bookmarked, workspaceId, order, lastAccessedAt, createdAt }`
- On tab navigate/bookmark/close → update/remove from collection
- On startup → query all tabs, recreate WebContentsViews, apply to workspaces
- Ephemeral cleanup: filter tabs where `!bookmarked && (now - lastAccessedAt > 8hrs)`, remove
- Update `lastAccessedAt` on tab activation

**Depends on**: Unit 1

---

## Unit 3: Workspace Persistence & CRUD

**Goal**: Workspaces persist across restarts. Implement missing commands: update, delete, move-tab, restore-tab.

**Files to modify**:
- `src/features/workspaces/workspaces.shared.ts` — add command/event types for update, delete, move-tab, restore-tab
- `src/features/workspaces/workspaces.main.ts` — implement 4 new command handlers, persistence
- `src/features/workspaces/workspaces.store.ts` — handle new events in renderer store
- `src/features/sidebar/sidebar.renderer.tsx` — add "new workspace" button + workspace edit view

**New commands** (per spec):
- `workspaces:update { workspaceId, changes: Partial<Workspace> }` — rename, recolor, re-icon
- `workspaces:delete { workspaceId }` — delete workspace (move tabs to default workspace)
- `workspaces:move-tab { targetWorkspaceId }` — move current tab to another workspace
- `workspaces:restore-tab` — navigate current tab back to its original bookmarked URL

**Depends on**: Unit 1

---

## Unit 4: Pinned Tabs

**Goal**: Full pinned tabs feature — the third tier of the tab model.

**Files to create**:
- `src/features/pinned-tabs/pinned-tabs.shared.ts` — types, command/event definitions
- `src/features/pinned-tabs/pinned-tabs.main.ts` — command handlers
- `src/features/pinned-tabs/pinned-tabs.store.ts` — Zustand store
- `src/features/pinned-tabs/pinned-tabs.renderer.tsx` — register store + events

**Commands** (per spec):
- `pinned-tabs:toggle-pin` — pin/unpin current tab
- `pinned-tabs:activate { tabId }` — activate a pinned tab

**Keyboard shortcut**: Ctrl+P

**Depends on**: Unit 1

---

## Unit 5: Tab Reordering

**Goal**: Drag-to-reorder tabs in sidebar. Move between bookmarked/ephemeral groups.

**Key details**:
- HTML5 Drag & Drop API
- Moving ephemeral tab to bookmarked section → auto-bookmark
- Moving bookmarked tab to ephemeral section → remove bookmark
- Folder drag deferred

**Depends on**: None strictly, benefits from Unit 2

---

## Unit 6: Remaining Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+W | Close current tab |
| Ctrl+1 through Ctrl+9 | Switch to workspace N |
| Ctrl+Shift+1 through Ctrl+Shift+9 | Move current tab to workspace N |

**Depends on**: Units 3 & 4

---

## Unit 7: Command Palette Enhancements

**Goal**: Improved input resolution, real-time UI feedback, URL visit history, suggestions, configurable search providers.

**Depends on**: Unit 1

---

## Dependency Graph

```
Unit 1 (RxDB Foundation)
├── Unit 2 (Tab Persistence)
├── Unit 3 (Workspace Persistence + CRUD)
├── Unit 4 (Pinned Tabs)
└── Unit 7 (Command Palette Enhancements)

Unit 5 (Tab Reordering) — independent, benefits from Unit 2
Unit 6 (Keyboard Shortcuts) — depends on Units 3 & 4
```

## Execution Order

1. Unit 1 → 2. Units 2+3+4 (parallel) → 3. Units 5+6+7 (parallel)
