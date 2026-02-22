# Component Patterns

## Declarations

Use function declarations with named exports. No `React.FC`.

```tsx
// GOOD
export function TabItem({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  return <div>...</div>;
}

// For reusable components, name the props interface
interface WorkspaceBubbleProps {
  workspace: Workspace;
  isActive: boolean;
  onEdit?: () => void;
}

export function WorkspaceBubble({ workspace, isActive, onEdit }: WorkspaceBubbleProps) {
  return <button>...</button>;
}
```

## Children

React 19 does not auto-include `children` in props. Declare explicitly.

```tsx
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2>{title}</h2>{children}</section>;
}
```

`React.ReactNode` covers strings, numbers, elements, arrays, fragments, null. Use it for `children` in virtually all cases.

## Generic Components

Must be function declarations (arrow functions lose generic params with FC).

```tsx
interface DataListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
}

function DataList<T>({ items, renderItem, keyExtractor }: DataListProps<T>) {
  return <>{items.map((item, i) => <div key={keyExtractor(item)}>{renderItem(item, i)}</div>)}</>;
}

// T is inferred from usage
<DataList items={tabs} renderItem={(tab) => <span>{tab.title}</span>} keyExtractor={(t) => t.id} />
```

## Discriminated Union Props

When props are conditionally required based on a variant:

```tsx
type ButtonProps =
  | { variant: "button"; onClick: () => void; href?: never }
  | { variant: "link"; href: string; onClick?: never };

function ActionButton(props: ButtonProps) {
  switch (props.variant) {
    case "link": return <a href={props.href}>...</a>;
    case "button": return <button onClick={props.onClick}>...</button>;
  }
}
```

The `never` annotations prevent accidentally passing conflicting props. Better than optional props + runtime checks.

## Compound Components

For component groups sharing implicit state (tabs, accordions, dropdowns):

```tsx
const TabsContext = createContext<{ activeTab: string; setActiveTab: (id: string) => void } | null>(null);

function Tabs({ defaultTab, children }: { defaultTab: string; children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return <TabsContext value={{ activeTab, setActiveTab }}>{children}</TabsContext>;
}

function Tab({ id, children }: { id: string; children: React.ReactNode }) {
  const { activeTab, setActiveTab } = use(TabsContext)!;
  return <button role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}>{children}</button>;
}

function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const { activeTab } = use(TabsContext)!;
  return activeTab === id ? <div role="tabpanel">{children}</div> : null;
}
```

Note: React 19 uses `<Context value={...}>` directly — no `.Provider` needed.

## Composition Patterns

**Render props** — only for slot-based composition where parent passes data to child:
```tsx
function DataList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => React.ReactNode }) {
  return <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>;
}
```

**Custom hooks** — for all reusable stateful logic (replaced render props for logic reuse).

**Children as props** — for structural composition where parent wraps content.

## Anti-patterns

**Nested component definitions** — creates new function identity every render, destroys reconciliation:
```tsx
// BAD
function Parent() {
  function Child() { return <div /> }  // re-created every render
  return <Child />;
}

// GOOD — define at module scope
function Child() { return <div /> }
function Parent() { return <Child />; }
```

**God components** — 500+ lines handling rendering, state, effects, business logic. Extract hooks for logic, break into composed components.

**Controlled/uncontrolled switching** — never switch a component between controlled and uncontrolled during its lifetime.
