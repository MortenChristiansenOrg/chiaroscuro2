# Test Organization

## File Layout

Tests are colocated with the code they test. Each feature owns all its tests.

```
src/features/{feature}/
  {feature}.main.ts
  {feature}.main.test.ts          # main-process unit tests (node env)
  {feature}.renderer.tsx
  {feature}.renderer.test.tsx     # component tests (jsdom env)
  {feature}.store.ts
  {feature}.store.test.ts         # store logic tests (node env)
  {feature}.shared.ts             # types/constants, no test file needed

src/bus/
  command-bus.ts
  command-bus.test.ts
  event-bus.ts
  event-bus.test.ts

src/data/
  memory-store.ts
  memory-store.test.ts
  store.ts
  store.test.ts

src/renderer/src/components/
  TooltipLayer.tsx
  TooltipLayer.test.tsx

e2e/
  fixtures/                       # Electron fixture, extended test
  pages/                          # Page objects (one per feature area)
  helpers/                        # IPC helpers, wait utilities
  tests/
    {feature}/                    # E2E specs grouped by feature
      {workflow}.spec.ts
```

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Unit/component test files | `.test.ts` or `.test.tsx` colocated | `tabs.main.test.ts` |
| E2E test files | `.spec.ts` in `e2e/tests/{feature}/` | `tab-management.spec.ts` |
| Page objects | `.page.ts` in `e2e/pages/` | `sidebar.page.ts` |
| `describe` blocks | Module or feature area name | `"tabs feature"`, `"TabItem"` |
| Nested `describe` | State or scenario group | `"during drag"`, `"active tab"` |
| `it` blocks | Verb-first, describes expected behavior | `"creates WebContentsView on tabs:create"` |

Avoid starting `it` descriptions with "should" — it's redundant and makes test output harder to scan.

## Avoiding Conflicts When Adding Features

The feature-based layout means:

1. **Each feature's tests live in its own directory.** Adding a new feature = adding a new directory. No edits to existing test files.

2. **Tests assert via the public API (commands, events, rendered output).** They don't reach into another feature's internals. A change in Feature A's implementation can't break Feature B's tests.

3. **Shared test utilities** live in `src/test-utils/` and are additive. New factories/mocks are added, existing ones are never modified (except to fix bugs).

4. **E2E tests are isolated by feature directory.** `e2e/tests/tabs/` and `e2e/tests/sidebar/` run independently. Cross-feature E2E tests go in a dedicated `e2e/tests/integration/` directory.

## Shared Test Utilities

Location: `src/test-utils/`

```
src/test-utils/
  index.ts              # re-exports
  render.tsx            # custom render with providers
  factories.ts          # test data factories (makeTab, makeWorkspace, etc.)
  mocks.ts              # shared mock implementations (createMockPlatform)
```

### Test Data Factories

Centralize object construction. Each factory returns valid defaults, accepts overrides:

```ts
// src/test-utils/factories.ts
let counter = 0;

export function makeTab(overrides: Partial<Tab> = {}): Tab {
  counter++;
  return {
    id: `tab-${counter}` as TabId,
    workspaceId: "ws-1" as WorkspaceId,
    url: "https://example.com",
    title: `Tab ${counter}`,
    favicon: "",
    loading: false,
    bookmarked: true,
    lastAccessedAt: 0,
    createdAt: 0,
    order: counter,
    ...overrides,
  };
}

export function resetFactories() { counter = 0; }
```

### Custom Render

Wrap components with any global providers needed across all tests:

```tsx
// src/test-utils/render.tsx
import { render, type RenderOptions } from "@testing-library/react";

function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { customRender as render };
export { screen, fireEvent, within, waitFor } from "@testing-library/react";
```

### Shared Mocks

```ts
// src/test-utils/mocks.ts
import { vi } from "vitest";
import type { Platform } from "../platform/types";

export function createMockPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    createWindow: vi.fn(),
    closeWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    // ... all Platform methods
    ...overrides,
  } as Platform;
}
```

## Setup Files

Consider adding a Vitest setup file for the renderer project to deduplicate common mocks:

```ts
// vitest.config.ts (renderer project)
{
  plugins: [react()],
  test: {
    name: "renderer",
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["src/test-utils/renderer-setup.ts"],
  },
}
```

```ts
// src/test-utils/renderer-setup.ts
import "@testing-library/jest-dom/vitest";

// Global mock of the preload bridge
const mockSendCommand = vi.fn(() => Promise.resolve());
const mockOnEvent = vi.fn(() => () => {});
Object.defineProperty(window, "chiaroscuro", {
  value: { sendCommand: mockSendCommand, onEvent: mockOnEvent },
  writable: true,
});

// jsdom missing APIs
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

This eliminates the duplicated `window.chiaroscuro` mock and `MockDataTransfer` class that currently appear in multiple test files.
