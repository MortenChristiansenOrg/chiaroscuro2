# TypeScript + React

## Hook Typing

### useState

```tsx
// Inferred — fine for primitives
const [count, setCount] = useState(0);

// Explicit generic when initial value doesn't cover all states
const [resolution, setResolution] = useState<ResolvedInput>({ type: "empty" });
const [selectedTab, setSelectedTab] = useState<Tab | null>(null);

// Prefer null over undefined for "no value" — more explicit
const [data, setData] = useState<Data | null>(null);
```

### useRef

React 19 requires an argument — `useRef()` with no arg is a TS error.

```tsx
// DOM refs — pass null
const elRef = useRef<HTMLDivElement>(null);

// Mutable refs — pass initial value
const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
const mountedRef = useRef(false);
```

### useReducer — discriminated unions

```tsx
type FetchState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };

type FetchAction<T> =
  | { type: "fetch" }
  | { type: "success"; data: T }
  | { type: "error"; error: string };

function fetchReducer<T>(state: FetchState<T>, action: FetchAction<T>): FetchState<T> {
  switch (action.type) {
    case "fetch":   return { status: "loading" };
    case "success": return { status: "success", data: action.data };
    case "error":   return { status: "error", error: action.error };
  }
}
```

### Custom hook returns

```tsx
// Tuple (1-2 values) — use "as const" to preserve tuple type
function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle] as const;
  // Without "as const": (boolean | (() => void))[] — unusable
}

// Object (3+ values) — inferred well, no "as const" needed
function useFetch<T>(url: string) {
  return { data, error, loading, refetch };
}
```

## Event Handler Types

Inline handlers are auto-inferred. Extracted handlers need explicit types:

```tsx
const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") { /* ... */ }
}, []);

// Native events in useEffect — use DOM types, not React types
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => { /* ... */ };
  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}, []);
```

Quick reference:

| Pattern | Type |
|---------|------|
| `onClick` | `React.MouseEvent<HTMLElement>` |
| `onChange` (input) | `React.ChangeEvent<HTMLInputElement>` |
| `onKeyDown` | `React.KeyboardEvent<HTMLElement>` |
| `onSubmit` | `React.FormEvent<HTMLFormElement>` |
| `onDragStart/Over/Drop` | `React.DragEvent<HTMLElement>` |
| Native `addEventListener` | `MouseEvent`, `KeyboardEvent` (no `React.` prefix) |

For component handler props, use domain-specific signatures — not React event types:
```tsx
interface TabItemProps {
  onDragStart?: (tabId: TabId, index: number) => void;
}
```

## Extending Native Element Props

```tsx
import type { ComponentProps } from "react";

// Extract props from native elements
type InputProps = ComponentProps<"input">;

// Extend with Omit for wrapper components
type GlassButtonProps = {
  variant?: "default" | "accent";
} & Omit<ComponentProps<"button">, "className">;
```

This is the standard shadcn/ui pattern.

## React 19 Changes

### ref as prop (forwardRef deprecated)

```tsx
// React 19 — ref is just a prop
function Input({ value, onChange, ref }: {
  value: string;
  onChange: (value: string) => void;
  ref?: React.Ref<HTMLInputElement>;
}) {
  return <input ref={ref} value={value} onChange={e => onChange(e.target.value)} />;
}
```

### Ref cleanup functions

```tsx
<div ref={(node) => {
  if (!node) return;
  const observer = new ResizeObserver(handleResize);
  observer.observe(node);
  return () => observer.disconnect();  // cleanup — new in React 19
}} />
```

## Common Mistakes

**Overusing `any`** — use `unknown` + narrowing at boundaries:
```tsx
// BAD
function sendCommand(name: string, payload: any) {}
// GOOD
function sendCommand(name: string, payload: unknown) {}
// BEST — discriminated union for typed commands
```

**Unnecessary type assertions** — prefer narrowing:
```tsx
// BAD
const input = document.getElementById("search") as HTMLInputElement;
// GOOD
const el = document.getElementById("search");
if (el instanceof HTMLInputElement) { el.value = "..."; }
```

**Type assertions at IPC boundaries are acceptable** — but zod validation is better.

**`as const` uses**: tuple returns, const config objects, satisfies + as const for validated const objects.

**Type-only imports** — always use `import type` when importing only types:
```tsx
import type { CSSProperties, ReactNode } from "react";
```
