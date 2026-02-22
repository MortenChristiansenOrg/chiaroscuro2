# State Management

## Decision Framework

| State Type | Tool |
|---|---|
| Local UI state (dropdowns, tooltips, modals) | `useState` / `useReducer` |
| Derived state (computed from other state) | Inline computation or `useMemo` |
| Form state | React 19 `useActionState` / controlled inputs |
| Shared client state (multiple components) | Zustand with selectors |
| Environment/config (theme, locale) | React Context |
| External store subscriptions | `useSyncExternalStore` |

### Decision Tree

```
Does only ONE component need it?
  YES → useState / useReducer
  NO  →
Can you lift state to a common parent (≤3 levels)?
  YES → Prop drilling (it's fine)
  NO  →
Is it low-frequency config? (theme, auth, locale)
  YES → React Context
  NO  →
Complex shared client state → Zustand
```

### This Project

- **Main process state** (workspaces, tabs, settings): lives in main process, exposed via IPC commands/events. Renderer stores (Zustand) subscribe to events and cache state.
- **Renderer-only UI state** (sidebar open, command palette input): local `useState`.
- **Cross-feature communication**: event bus via `.shared.ts` contracts. Never import another feature's store directly.

## Derived State — The Golden Rule

**Store minimal state. Derive everything else.**

```tsx
// BAD — redundant state synchronized via useEffect
const [items, setItems] = useState<Item[]>([]);
const [filteredItems, setFilteredItems] = useState<Item[]>([]);
useEffect(() => { setFilteredItems(items.filter(i => i.active)); }, [items]);

// GOOD — derive during render
const [items, setItems] = useState<Item[]>([]);
const filteredItems = items.filter(i => i.active);
const count = filteredItems.length;
```

Only use `useMemo` when the derivation is measured as expensive (>1ms). With React Compiler, even this is automatic.

### Five Principles of State Structure

1. **Group related state** — if two vars always update together, merge into one object
2. **Avoid contradictions** — single `status` enum, not multiple booleans
3. **Avoid redundant state** — if computable, don't store it
4. **Avoid duplication** — store `selectedId`, not `selectedItem` (look it up)
5. **Avoid deep nesting** — flatten/normalize nested structures

```tsx
// BAD — contradictory booleans
const [isLoading, setIsLoading] = useState(false);
const [isError, setIsError] = useState(false);

// GOOD — single status
const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
```

## Zustand Patterns

Already in use in this project. Key practices:

```tsx
// Use selectors to avoid full-store re-renders
const activeId = useWorkspacesStore(s => s.activeId);  // GOOD
const store = useWorkspacesStore();  // BAD — subscribes to everything

// For derived selectors with array/object results, use useShallow
import { useShallow } from "zustand/shallow";
const names = useWorkspacesStore(useShallow(s => s.workspaces.map(w => w.name)));
```

## React Context — When and How

Context is for **low-frequency, broadly-needed values**: theme, locale, feature flags.

### Split by concern
```tsx
// BAD — monolithic context, any change re-renders all consumers
const AppContext = createContext({ theme, user, locale, notifications });

// GOOD — separate by update frequency
const ThemeContext = createContext(theme);
const AuthContext = createContext(user);
```

### Memoize provider values
```tsx
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState("dark");
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
```

If you have >5 stacked providers, switch to Zustand for shared state. Keep Context only for environment/config values.

## Anti-patterns

### useEffect for state sync

The most common and damaging anti-pattern. If no external system is involved, you don't need an Effect.

```tsx
// BAD — useEffect to reset state on prop change
useEffect(() => { setComment(""); }, [userId]);
// GOOD — use key to remount
<Profile userId={userId} key={userId} />

// BAD — notify parent via effect
useEffect(() => { onChange(isOn); }, [isOn]);
// GOOD — call in event handler
function handleClick() {
  const next = !isOn;
  setIsOn(next);
  onChange(next);
}
```

### Effect cascades
```tsx
// BAD — three sequential renders
useEffect(() => { setA(computeA(data)); }, [data]);
useEffect(() => { setB(computeB(a)); }, [a]);

// GOOD — derive in one pass or compute inline
const a = computeA(data);
const b = computeB(a);
```

### State synchronization between stores
```tsx
// BAD — two sources of truth
const zustandFilter = useStore(s => s.filter);
const [localFilter, setLocalFilter] = useState(zustandFilter);
useEffect(() => { setLocalFilter(zustandFilter); }, [zustandFilter]);

// GOOD — single source
const filter = useStore(s => s.filter);
```

### Prop drilling — when it's actually fine
2-3 levels of prop passing is **not a problem**. It's explicit and easy to trace. Only solve it when props pass through 4+ intermediary components that don't use them.

**Before reaching for Context, try composition:**
```tsx
// Instead of drilling user through Header → Nav → Avatar
<Header>
  <Nav>
    <Avatar user={user} />
  </Nav>
</Header>
```
