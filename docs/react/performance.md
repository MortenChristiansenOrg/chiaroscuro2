# Performance

## React Compiler

v1.0 released Oct 2025. Build-time Babel plugin that auto-memoizes components, hooks, and values. Eliminates most manual `useMemo`, `useCallback`, `React.memo`.

### Setup (Vite)

```bash
bun add -d babel-plugin-react-compiler@latest
```

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    react({
      babel: { plugins: ["babel-plugin-react-compiler"] },
    }),
  ],
});
```

### What it auto-optimizes
- Component return values (equivalent to `React.memo`)
- Expensive expressions inside render (equivalent to `useMemo`)
- Callback functions passed as props (equivalent to `useCallback`)
- Dependency tracking — no stale closure bugs from forgotten deps

### When manual optimization is still needed
- **Structural problems** — compiler can't restructure your component tree
- **Virtualization** — 10k list items are still slow even if each is memoized
- **Web Workers / UtilityProcess** — offloading CPU work
- **Code splitting** — still manual via `React.lazy`
- **Rules of React violations** — compiler assumes pure renders

### Directives
- `"use no memo"` at top of function body — opt out a specific component (escape hatch)

## Structural Patterns (Always Relevant)

These outperform memoization and work with or without the compiler.

### Move state down

```tsx
// BAD — parent re-renders everything on input change
function App() {
  const [query, setQuery] = useState("");
  return <div><SearchInput value={query} onChange={setQuery} /><ExpensiveTree /></div>;
}

// GOOD — isolate stateful part
function SearchSection() {
  const [query, setQuery] = useState("");
  return <SearchInput value={query} onChange={setQuery} />;
}
function App() {
  return <div><SearchSection /><ExpensiveTree /></div>;
}
```

### Children as props

```tsx
function ScrollTracker({ children }: { children: React.ReactNode }) {
  const [scrollY, setScrollY] = useState(0);
  return (
    <div onScroll={e => setScrollY(e.currentTarget.scrollTop)}>
      <ScrollIndicator y={scrollY} />
      {children}  {/* stable reference, no re-render */}
    </div>
  );
}
```

### State colocation

Keep state as close as possible to where it's used. Don't hoist state "just in case."

### Lazy useState initialization

```tsx
// BAD — expensive function runs every render (result discarded after first)
const [data, setData] = useState(parseExpensiveJSON(raw));
// GOOD — initializer runs only once
const [data, setData] = useState(() => parseExpensiveJSON(raw));
```

## Code Splitting

Split heavy features so the main browser view loads fast. In Electron, parsing/executing JS is the cost (not network).

```tsx
import { lazy, Suspense } from "react";

const Settings = lazy(() => import("./features/settings/Settings"));

// Place Suspense around independent regions, not individual components
<Suspense fallback={<Skeleton />}>
  <Settings />
</Suspense>
```

### Preload on hover
```tsx
function lazyWithPreload(factory: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(factory);
  (Component as any).preload = factory;
  return Component;
}

const Settings = lazyWithPreload(() => import("./Settings"));

<button onMouseEnter={() => Settings.preload?.()}>Settings</button>
```

## List Virtualization

Virtualize lists over ~100 items. Use `@tanstack/react-virtual`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: "400px", overflow: "auto" }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map(row => (
          <div key={row.key} style={{
            position: "absolute", top: 0, width: "100%",
            height: `${row.size}px`, transform: `translateY(${row.start}px)`,
          }}>
            {items[row.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Expensive Computations

For work >16ms (one frame), offload:

- **Web Workers** — for renderer-side heavy computation
- **Electron UtilityProcess** — better than workers, full Node API:
  ```ts
  // main process
  const child = utilityProcess.fork(path.join(__dirname, "heavy-computation.js"));
  child.postMessage({ type: "COMPUTE", data: largeDataset });
  child.on("message", (result) => { mainWindow.webContents.send("result", result); });
  ```
- **requestIdleCallback** — for deferrable work (e.g., precomputing search indexes)

## Common Mistakes

### Creating objects/arrays in render
```tsx
// BAD — new object every render, child always re-renders
<Child style={{ color: "red" }} />

// GOOD — hoist constants
const childStyle = { color: "red" };
<Child style={childStyle} />
```

### Inline functions — when it matters
Fine for simple handlers on non-memoized elements. Problem when passed to memoized/virtualized list items:
```tsx
// PROBLEM — each item gets a new function reference
{items.map(item => <MemoizedItem key={item.id} onClick={() => handleClick(item.id)} />)}

// FIX — stable callback, item reads its own id
const handleItemClick = useCallback((id: string) => handleClick(id), []);
{items.map(item => <MemoizedItem key={item.id} id={item.id} onClick={handleItemClick} />)}
```

React Compiler eliminates most of these concerns.

### Forgetting cleanup

Critical in Electron apps that run for hours/days:
```tsx
useEffect(() => {
  const interval = setInterval(pollData, 5000);
  const handler = (e: Event) => handleResize(e);
  window.addEventListener("resize", handler);
  return () => {
    clearInterval(interval);
    window.removeEventListener("resize", handler);
  };
}, []);
```

### Key management
```tsx
// BAD — index as key causes state bugs on reorder/filter
{items.map((item, i) => <Item key={i} data={item} />)}
// GOOD — stable unique ID
{items.map(item => <Item key={item.id} data={item} />)}
```

## Profiling

- **React DevTools Profiler** — record interactions, identify slow renders
- **Chrome Performance tab** — flame chart for long tasks (available in Electron DevTools)
- **`<Profiler>` component** — programmatic measurement:
  ```tsx
  <Profiler id="Sidebar" onRender={(id, phase, actualDuration) => {
    if (actualDuration > 16) console.warn(`Slow render: ${id} ${actualDuration.toFixed(1)}ms`);
  }}>
    <Sidebar />
  </Profiler>
  ```

## Priority Checklist

1. Fix component structure (state colocation, children pattern, context splitting)
2. Adopt React Compiler (eliminates 80% of memoization busywork)
3. Code split routes and heavy features with `lazy()` + `Suspense`
4. Virtualize lists over ~100 items
5. Offload computations >16ms to workers/UtilityProcess
6. Profile before optimizing
7. Clean up effects and subscriptions
