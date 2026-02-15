# Hooks Patterns

## React 19 Hooks

### useActionState

Wraps an async function and tracks its lifecycle. Replaces manual `isLoading`/`error`/`data` state management.

```tsx
const [state, dispatch, isPending] = useActionState(actionFn, initialState);
```

**For IPC round-trips:**
```tsx
async function saveSettings(prev: Settings, patch: Partial<Settings>) {
  const merged = { ...prev, ...patch };
  await window.chiaroscuro.sendCommand("settings:save", merged);
  return merged;
}

function SettingsPanel() {
  const [settings, save, isSaving] = useActionState(saveSettings, defaultSettings);
  function handleChange(key: string, value: unknown) {
    startTransition(() => save({ [key]: value }));
  }
  return <input value={settings.theme} onChange={e => handleChange("theme", e.target.value)} disabled={isSaving} />;
}
```

**With forms:**
```tsx
function RenameForm() {
  const [state, dispatch, isPending] = useActionState(renameAction, { error: null });
  return (
    <form action={dispatch}>
      <input name="newName" />
      <button disabled={isPending}>Rename</button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

### useOptimistic

Shows temporary state immediately while an async operation is in flight.

```tsx
function TabItem({ tab, onRename }: { tab: Tab; onRename: (id: string, name: string) => Promise<void> }) {
  const [optimisticTab, setOptimisticTab] = useOptimistic(
    tab,
    (current, newName: string) => ({ ...current, name: newName })
  );

  async function handleRename(newName: string) {
    setOptimisticTab(newName);        // instant UI
    await onRename(tab.id, newName);  // persists; reverts on error
  }

  return <span>{optimisticTab.name}</span>;
}
```

### use()

Reads Promises or Context. Unlike other hooks, callable inside conditionals/loops.

```tsx
// Conditional context reading
function Panel({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext);
    return <div className={theme}>Themed</div>;
  }
  return <div>Default</div>;
}

// Promise reading (with Suspense)
function WorkspaceData({ dataPromise }: { dataPromise: Promise<Workspace> }) {
  const workspace = use(dataPromise);  // suspends until resolved
  return <div>{workspace.name}</div>;
}
```

**Critical:** promises passed to `use()` must be stable across renders. Create outside the component or memoize.

### useDeferredValue

Deprioritize expensive re-renders while keeping input responsive:

```tsx
function CommandPalette({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  const results = filterCommands(deferredQuery);  // uses deferred value
  return <ResultList results={results} />;
}
```

## useEffect — When to Use

**DO use for:** subscribing to external systems (window events, IPC listeners, ResizeObserver, IntersectionObserver), data fetching with cleanup.

**Do NOT use for:**
- Deriving state from props/state → compute during render
- Handling user events → put in event handlers
- Transforming data → compute during render
- Chaining state updates → do in the event handler
- Notifying parent of state changes → call parent callback in handler
- Resetting state on prop change → use `key` prop
- POST/write requests triggered by user action → event handler

**Decision rule:** is there an external system involved? If no → it doesn't belong in an effect.

## useSyncExternalStore

For subscribing to non-React state sources. Preferred over manual `useEffect` + `addEventListener`:

```tsx
function useEventBusValue<T>(event: string, getSnapshot: () => T): T {
  return useSyncExternalStore(
    (callback) => {
      const unsub = window.chiaroscuro.onEvent(event, callback);
      return unsub;
    },
    getSnapshot
  );
}
```

## Custom Hook Guidelines

- **Single responsibility** — one hook, one concern
- **Name starts with `use`**, describes behavior: `useTabNavigation`, `useWorkspaceSync`
- **Extract logic from components** — hooks hold domain/business logic, components focus on presentation
- **Return tuple for 1-2 values**, object for 3+
- **Always return cleanup functions** from subscriptions — critical in long-running Electron apps

```tsx
// Good custom hook: single concern, cleanup, descriptive name
function useWindowResize(callback: (width: number, height: number) => void) {
  useEffect(() => {
    const handler = () => callback(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [callback]);
}
```
