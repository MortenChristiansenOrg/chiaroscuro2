# Project Structure & Conventions

## Feature-Based Organization

Each feature is a vertical slice: UI + logic + types + tests, colocated.

```
src/features/{feature-name}/
  {feature}.feature.ts      # renderer registration (zones: Chrome, Sidebar, Overlay)
  {feature}.main.ts         # main-process command handlers
  {feature}.renderer.tsx    # React components
  {feature}.shared.ts       # public API: commands, events, types
  {feature}.store.ts        # Zustand store + event subscriptions
  {feature}.test.ts         # colocated tests
```

### Module Boundaries

| File | Who can import it |
|---|---|
| `*.shared.ts` | Any feature, renderer, main process |
| `*.main.ts` | Only `src/main/index.ts` |
| `*.renderer.tsx` | Only renderer shell/app |
| `*.store.ts` | Only the feature's own renderer + feature.ts |
| `*.feature.ts` | Only renderer shell |

**Rule:** features never import another feature's `.main.ts`, `.store.ts`, or `.renderer.tsx`. Cross-feature communication goes through the command/event bus using types from `.shared.ts`.

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files | kebab-case with dot role delimiter | `command-palette.renderer.tsx` |
| Components | PascalCase, named exports | `export function CommandPalette()` |
| Hooks | `use` prefix, camelCase | `useActiveTab`, `useWorkspaces` |
| Types | PascalCase with role suffix | `TabsCreatePayload`, `Tab`, `WorkspaceId` |
| Constants | UPPER_SNAKE_CASE | `TABS_CREATE`, `TABS_ACTIVATED` |
| Tests | `.test.ts` / `.test.tsx` suffix, colocated | `tabs.store.test.ts` |

## Barrel Exports — Avoid

Barrels (`index.ts`) cause slower builds, circular dependencies, broken tree-shaking, and IDE confusion. The `.shared.ts` pattern already serves as a controlled public API.

**Exception:** small, stable library modules like `src/bus/index.ts`.

## Shared Code

```
src/
  shared/              # types, constants used everywhere (cross-process)
  bus/                 # command/event infrastructure
  data/                # persistence layer
  renderer/src/
    components/        # shared React components (Icon, TooltipLayer)
    lib/               # renderer-side utilities (cn(), etc.)
```

- **Shared means used by 2+ features.** Don't preemptively extract.
- Shared code **never imports from features** (unidirectional dependency).

## Error Handling

### Error boundaries

Use `react-error-boundary` for function-component-friendly error boundaries:

```tsx
import { ErrorBoundary } from "react-error-boundary";

// Per-feature boundaries + top-level catch-all
<ErrorBoundary FallbackComponent={AppError}>
  <ErrorBoundary FallbackComponent={SidebarError}><Sidebar /></ErrorBoundary>
  <ErrorBoundary FallbackComponent={ContentError}><Content /></ErrorBoundary>
</ErrorBoundary>
```

Error boundaries do NOT catch: event handler errors, async errors, timeouts. For those:

```tsx
function MyComponent() {
  const { showBoundary } = useErrorBoundary();
  async function handleClick() {
    try { await riskyOperation(); }
    catch (error) { showBoundary(error); }
  }
}
```

### Main process errors
Catch in command handlers, return structured error responses through IPC.

## Accessibility

- Use semantic HTML (`<button>`, `<nav>`, `<dialog>`) — never `onClick` on `<div>`
- All interactive UI must work with Tab, Enter, Space, Arrow keys, Escape
- Focus traps in modals/command palette; restore focus on close
- ARIA patterns: `role="combobox"` + `aria-activedescendant` for command palette, `role="tablist"` for tabs

## Testing

### What to test (priority)
1. User-visible behavior (click X → see Y)
2. Critical business logic (command handlers, state transformations)
3. Edge cases (empty states, error states)
4. Integration (features via command/event bus)

### What NOT to test
- Implementation details (internal state values)
- That React hooks work
- Styling/layout (use visual regression instead)

### React Testing Library
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("creates tab when URL submitted", async () => {
  const user = userEvent.setup();
  render(<CommandPalette />);
  await user.type(screen.getByRole("combobox"), "https://example.com");
  await user.keyboard("{Enter}");
  expect(screen.getByText("example.com")).toBeInTheDocument();
});
```

- Query by role, label, text — the way a user finds elements
- Use `userEvent` over `fireEvent`
- Avoid `getByTestId` except as last resort

### Testing by file type
| File | How to test |
|---|---|
| `.shared.ts` | Pure types/constants — no runtime tests needed |
| `.store.ts` | `renderHook` or via component that consumes the store |
| `.main.ts` | Unit test command handlers directly |
| `.renderer.tsx` | React Testing Library component tests |
