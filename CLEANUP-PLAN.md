# Feature File Review: Imperative -> Declarative

## Current State

Each feature is a module with `register()` + `start()` exports. Inside: module-scoped mutable state (Maps, timers, flags), manual event listener cleanup tracked in `Map<TabId, () => void>`, ad-hoc debounce/throttle timers, and cross-feature state access via exported getters. The buses (`CommandBus`, `EventBus`) are minimal -- typed but with no middleware, lifecycle, or composition support.

## Key Pain Points

1. **Scattered mutable state** -- each feature has 3-6 module-level `let`/`Map`/`Set` variables with no encapsulation
2. **Manual cleanup tracking** -- 5+ features maintain `Map<TabId, (() => void)[]>` for listener cleanup
3. **Duplicated debounce/throttle logic** -- app-state, downloads, tabs each reinvent timers
4. **No atomicity** -- multi-step mutations (memory -> persist -> emit) can partially fail
5. **Cross-feature coupling** -- `getTab()`, `getAllTabs()`, `setTabOrder()` etc. create circular dependencies
6. **Boilerplate in index.ts** -- 120 lines of imports, manual registration order, manual type merging
7. **No structured teardown** -- `before-quit` only flushes app-state; other features leak

---

## Three Approaches

### Approach A: Lifecycle + Utilities (minimal, pragmatic)

Keep the current architecture but add lightweight utilities to eliminate the most common imperative patterns.

**What it adds:**
- **`TabScope`** -- associates cleanup functions with a tab ID; auto-runs them on `TABS_CLOSED`. Replaces all the `tabCleanups` Maps.
- **`DebouncedSave<T>`** -- wraps a value + dataStore key with auto-debounce and flush-on-quit. Replaces 3+ hand-rolled timer patterns.
- **`SingletonTab`** -- handles "open-or-activate" with race-condition protection. Replaces 3 near-identical patterns in settings/domain-css/local-web-app.
- **`defineFeature()`** -- thin wrapper that gives each feature `register`, `start`, `teardown` and auto-wires them in `index.ts`, eliminating the 120-line import wall.

**Pros:** Smallest diff, no new deps, easy to adopt incrementally.
**Cons:** Doesn't fix cross-feature coupling or atomicity. Features are still bags of imperative handlers, just with less boilerplate.

**Estimated impact:** Removes ~30-40% of imperative boilerplate. Each feature shrinks by 15-30 lines.

---

### Approach B: Reactive State Stores (medium, structural)

Give each feature a typed, observable state container. Command handlers become state transitions; events are derived from state changes.

**What it adds:**
- **`FeatureStore<State>`** -- like a mini-Zustand for the main process. Holds a feature's entire state in one object. Emits diffs on mutation. Supports middleware (persist, debounce, log).
- State changes auto-emit the feature's "changed" event -- no manual `emitChanged()` calls.
- Persistence becomes a middleware: `persist(store, dataStore, key, { debounce: 500 })`.
- Cross-feature reads go through store subscriptions instead of exported getters, breaking circular imports.

**Example transformation (app-state):**
```ts
// Before: 3 module vars, manual debounce, manual flush
let current: PersistedAppState;
let saveTimer;
function scheduleSave() { ... }
function flushSave() { ... }

// After: single store with persist middleware
const store = createFeatureStore<PersistedAppState>(defaults);
persist(store, dataStore, "app-state", { debounce: 500 });
// State changes auto-persist. Flush on quit via store.flush().
```

**No new npm deps** -- `FeatureStore` is ~80 lines (just `EventEmitter` + simple `setState` like Zustand's core).

**Pros:** Single source of truth per feature. Eliminates manual emit/persist/debounce. Makes state transitions testable (assert against store snapshots). Breaks circular deps.
**Cons:** Requires rewriting most feature files (medium effort). State shape needs upfront design. Some features (tabs, folders) have complex relational state that doesn't fit a flat store well.

**Estimated impact:** Removes ~60-70% of imperative code. Features become "store + handlers that call `store.setState()`".

---

### Approach C: XState Actors (ambitious, formal)

Model each feature as an XState v5 actor/state machine. The feature's behavior is fully declarative: states, transitions, guards, effects.

**What it adds:**
- Each feature becomes a `createMachine({ ... })` definition with explicit states (e.g. find-text: `idle -> searching -> found/notFound`).
- Side effects (persistence, platform calls) live in `actions` and `services`, not inline in handlers.
- Tab lifecycle becomes a spawned child actor -- cleanup is automatic when the actor stops.
- Cross-feature communication via actor `sendTo()` -- no shared mutable state.

**Example (find-text):**
```ts
const findTextMachine = createMachine({
  id: "find-text",
  initial: "idle",
  states: {
    idle: {
      on: { "find-text:start": "searching" }
    },
    searching: {
      entry: ["injectFindListener"],
      on: {
        "found-in-page": { actions: ["emitResults"] },
        "find-text:stop": "idle",
        "tabs:closed": "idle"
      },
      exit: ["stopFindInPage", "cleanupListener"]
    }
  }
});
```

**New dep:** `xstate` (~15kb). Zero-dep itself.

**Pros:** Most declarative -- states, transitions, side effects are all visible in the machine definition. Impossible to be in an invalid state. Visualizable with Stately Studio. Automatic cleanup via actor lifecycle. Great for complex features (tabs, folders, installer with update states).
**Cons:** Biggest learning curve. Overkill for simple features (zoom, dev-tools are just "on command, do thing"). Requires rethinking the bus architecture -- XState actors have their own event/message passing. Largest migration effort.

**Estimated impact:** Features become pure state machine definitions. ~80-90% of imperative code eliminated. But the migration is substantial.

---

## Recommendation

**Start with Approach A**, then selectively adopt Approach B for stateful features.

- A's utilities (`TabScope`, `DebouncedSave`, `SingletonTab`, `defineFeature`) are immediately useful and can be built in a day. They reduce the noise so you can see which features actually have complex state logic.
- After A, apply B's `FeatureStore` to the 5-6 features with meaningful state: tabs, folders, domain-css, pinned-tabs, app-state, local-web-app. Simple features (zoom, dev-tools, tooltip) stay as plain handlers.
- C (XState) is worth considering later for the installer (which has real state machine behavior: checking -> downloading -> installing -> restarting) and possibly tabs (complex lifecycle). But adopting it project-wide would be over-engineering.

---

## Unresolved Questions

1. Should `FeatureStore` use immutable state (spread on every update) or mutable + dirty tracking? Immutable is safer but verbose for nested state like tabs.
2. For `defineFeature()`, should features declare dependencies explicitly (enabling topological sort for startup order), or keep the current manual ordering in index.ts?
3. The current `CommandBus` is request/response. Would adding middleware (logging, error wrapping, retry) to the bus itself be a better place to solve the `.catch(console.error)` problem than per-feature utilities?
4. Should `TabScope` be a bus-level concept (the event bus auto-cleans subscriptions tagged with a tab ID) or a standalone utility that features opt into?
