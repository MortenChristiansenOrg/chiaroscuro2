# Architecture

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

## Platform Abstraction

Interface wrapping WebContentsView management, sessions, windows, keyboard shortcuts, downloads, clipboard, and shell access. Two implementations:

- **`ElectronPlatform`** — production, delegates to real Electron APIs
- **`MockPlatform`** — tests, in-memory simulation

## Data Abstraction

Interface wrapping RxDB + JSON storage. RxDB provides reactive NoSQL document collections with MongoDB-like queries — no SQL. Per-feature collections with schema validation and migrations. Two implementations:

- **`RxDBDataStore`** — production, backed by RxDB with free Filesystem RxStorage (main process) + JSON files for settings
- **`InMemoryDataStore`** — tests, RxDB Memory RxStorage, no filesystem

## Command Bus

Routes named commands to a single handler each. Commands are imperative; exactly one handler per command name.

```typescript
bus.handle("tabs:create", handler); // register
bus.send("tabs:create", { url }); // invoke
```

## Event Bus

Pub/sub for outcome events. Events are past-tense; zero or more listeners.

```typescript
bus.on("tabs:created", listener); // subscribe
bus.emit("tabs:created", { tab }); // publish
```

Both buses bridge the IPC boundary transparently — features don't know which process they're talking to.

## Process Boundary

Features span main + renderer via up to 3 files:

- **`feature.main.ts`** — main-process logic (platform calls, data access, command handlers)
- **`feature.renderer.tsx`** — renderer logic (React state, UI components)
- **`feature.shared.ts`** — shared types, command/event names, payload schemas

## Strong Typing for Commands & Events

Command/event names and payloads are TypeScript types in each feature's `.shared.ts`. The bus is generic over a type registry so `bus.send('tabs:create', payload)` is compile-time checked — misspelled names or wrong payloads are type errors. Registry built by merging each feature's command/event type maps.

## Feature Registration & Startup

Features are registered via a manual list in entry points (explicit, no magic). Startup is two-phase:

1. **Register** — all features register command handlers, event listeners, key bindings, and other passive setup. No side effects.
2. **Start** — all features begin active logic (publishing events, loading persisted state, etc.). Only runs after every feature completes phase 1.

This guarantees all handlers are wired before any events flow.

## Testability

Three tiers:

- **Unit tests** — feature tested with MockPlatform + InMemoryDataStore (RxDB Memory RxStorage). No Electron dependency. Verify command handling and event emission in isolation.
- **Integration tests** — multiple features wired together with mocks. Verify cross-feature command/event flows.
- **E2E tests** — real Electron app. Cover user workflows from feature specs (e.g. "Open a page", "Switch workspace", "Bookmark the current tab"). Full stack from UI through platform to persisted state.

## Directory Structure

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

## React Component Organization

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

## Feature ↔ UI Communication

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
