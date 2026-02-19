# Unit & Component Tests

## Configuration

`vitest.config.ts` defines two projects:

- **`main`** — Node environment, runs `src/**/*.test.ts` (excludes `src/renderer/`)
- **`renderer`** — jsdom environment with React plugin, runs `src/**/*.test.tsx`

The file extension (`.ts` vs `.tsx`) determines which project runs the test.

## React Testing Library

### Query Priority

Query elements the way a user finds them:

1. `getByRole` — buttons, links, headings, comboboxes
2. `getByLabelText` — form inputs
3. `getByText` — visible text content
4. `getByTestId` — last resort only

### User Events

Prefer `userEvent` over `fireEvent`. `userEvent` simulates full user interactions (focus, keydown, keyup, input) while `fireEvent` dispatches a single DOM event.

```tsx
import userEvent from "@testing-library/user-event";

test("activates tab on click", async () => {
  const user = userEvent.setup();
  render(<TabItem {...props} />);
  await user.click(screen.getByRole("button", { name: /example/i }));
  expect(mockSendCommand).toHaveBeenCalledWith("tabs:activate", { tabId: "tab-1" });
});
```

Exception: `fireEvent` is appropriate for drag events and other low-level DOM events that `userEvent` doesn't model well.

## Testing Zustand Stores

Test stores as plain JS modules — no React rendering needed for logic tests:

```ts
import { useSidebarStore } from "./sidebar.store";

describe("sidebar store", () => {
  beforeEach(() => {
    useSidebarStore.setState({ visible: true, announcement: "" });
  });

  it("hides sidebar on visibility event", () => {
    // simulate event handler
    useSidebarStore.getState().onVisibilityChanged({ visible: false });
    expect(useSidebarStore.getState().visible).toBe(false);
  });
});
```

For hooks that derive data from stores, use `renderHook`:

```ts
import { renderHook, act } from "@testing-library/react";

it("returns filtered tabs", () => {
  const { result } = renderHook(() => useSidebarStore((s) => s.filteredTabs));
  act(() => useSidebarStore.setState({ filter: "example" }));
  expect(result.current).toHaveLength(1);
});
```

## Testing Main-Process Features

Each feature's `.main.ts` registers command handlers. Test by creating the buses and mocks, registering the feature, then sending commands:

```ts
function setup(platformOverrides: Partial<Platform> = {}) {
  const commands = new CommandBus<FeatureCommands>();
  const events = new EventBus<FeatureEvents>();
  const platform = createMockPlatform(platformOverrides);
  register({ commands, events, platform });
  return { commands, events, platform };
}

it("creates tab via platform on tabs:create", async () => {
  const { commands, platform } = setup();
  await commands.send("tabs:create", { url: "https://example.com" });
  expect(platform.createTab).toHaveBeenCalledWith(
    expect.objectContaining({ url: "https://example.com" })
  );
});
```

## Mocking Patterns

### The Preload Bridge (`window.chiaroscuro`)

Every renderer component communicates with main via `window.chiaroscuro.sendCommand`. Mock it globally in a setup file or per-test:

```ts
const mockSendCommand = vi.fn(() => Promise.resolve());
Object.defineProperty(window, "chiaroscuro", {
  value: { sendCommand: mockSendCommand },
  writable: true,
});
```

### Module Mocks (`vi.mock`)

Hoisted above imports. Use sparingly — prefer dependency injection or spies.

```ts
vi.mock("../../bus/command-bus", () => ({
  CommandBus: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
    handle: vi.fn(),
  })),
}));
```

### Partial Module Mocks

Keep real exports, override one function:

```ts
vi.mock("./suggestions", async (importOriginal) => {
  const real = await importOriginal<typeof import("./suggestions")>();
  return { ...real, fetchSuggestions: vi.fn(() => Promise.resolve([])) };
});
```

### Spies (`vi.spyOn`)

Preferred when you only need to intercept one method on an existing object:

```ts
vi.spyOn(platform, "writeClipboard").mockImplementation(() => {});
```

### Fake Timers

For components with delays, debounces, or animations:

```ts
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

it("shows tooltip after delay", () => {
  fireEvent.mouseEnter(element);
  vi.advanceTimersByTime(500);
  expect(screen.getByRole("tooltip")).toBeVisible();
});
```

### Browser APIs Missing in jsdom

jsdom lacks `DataTransfer`, `ResizeObserver`, `IntersectionObserver`, etc. Mock them in test setup:

```ts
class MockDataTransfer {
  data = new Map<string, string>();
  effectAllowed = "uninitialized";
  dropEffect = "none";
  setData(f: string, v: string) { this.data.set(f, v); }
  getData(f: string) { return this.data.get(f) ?? ""; }
  setDragImage() {}
}
Object.defineProperty(globalThis, "DataTransfer", { value: MockDataTransfer, writable: true });
```

## Accessibility Testing

Use `vitest-axe` for automated a11y checks at the component level:

```ts
import { axe } from "vitest-axe";

it("has no a11y violations", async () => {
  const { container } = render(<TabItem {...defaultProps()} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Limitations: color contrast doesn't work in jsdom. Use `@axe-core/playwright` in E2E for full-fidelity a11y audits.

Manual a11y checks to include in component tests:
- Correct ARIA roles (`role="tablist"`, `role="combobox"`, etc.)
- `aria-label` / `aria-labelledby` on interactive elements
- Focus management (focus traps in modals, focus restoration on close)
- Keyboard navigation (Tab, Enter, Space, Arrow keys, Escape)

## Snapshot Testing

Use sparingly and intentionally. Best for:
- Serialized data structures (IPC message shapes, store state shapes)
- Small inline snapshots for pure function outputs

```ts
it("serializes tab for IPC", () => {
  expect(serializeTab(makeTab())).toMatchInlineSnapshot(`
    {
      "id": "tab-1",
      "title": "Example",
      "url": "https://example.com",
    }
  `);
});
```

Prefer `toMatchInlineSnapshot()` over `toMatchSnapshot()` — inline snapshots live in the test file, are easier to review in PRs, and force you to keep them small.

Avoid snapshots for: full component render output, anything with dynamic data (timestamps, IDs).
