# Feature Test Guide

Every implemented feature must have tests covering its spec requirements. This document explains the process.

## Principle

Feature specs in `docs/features/` define **requirements**, **workflows**, **interactions**, and **commands/events**. Tests must map to these. When you implement a feature, you write tests that verify each requirement. When you add new functionality to an existing feature, you add tests — never modify or break existing tests.

## Process

### 1. Read the Feature Spec

Open `docs/features/{Feature}Feature.specs.md`. Identify:

- **Requirements** — each bullet is a testable assertion
- **Workflows** — each workflow is an E2E test scenario
- **Commands & Events** — each command needs a unit test for its handler; each event needs verification that it's emitted at the right time
- **Interactions** — keyboard shortcuts and mouse interactions need component tests

### 2. Map Requirements to Test Cases

For each requirement, decide the test tier:

| Spec Section | Test Tier | File |
|---|---|---|
| Core behavior / business rules | Unit test | `{feature}.main.test.ts` or `{feature}.store.test.ts` |
| UI interactions (click, keyboard) | Component test | `{feature}.renderer.test.tsx` |
| Commands (handler logic) | Unit test | `{feature}.main.test.ts` |
| Events (emission) | Unit test | `{feature}.main.test.ts` |
| Full workflows | E2E test | `e2e/tests/{feature}/*.spec.ts` |
| Cross-feature flows | Integration or E2E | depends on complexity |

### 3. Structure Tests Around the Spec

Use `describe` blocks that mirror the spec's sections:

```ts
// tabs.main.test.ts
describe("tabs feature", () => {
  describe("core behavior", () => {
    it("creates WebContentsView on tabs:create", async () => { ... });
    it("shows/hides views on tabs:activate (not destroy/create)", async () => { ... });
    it("destroys WebContentsView on tabs:close", async () => { ... });
    it("removes tab from list on tabs:close", async () => { ... });
  });

  describe("workspaces", () => {
    it("filters tab list to current workspace tabs", async () => { ... });
    it("activates pinned tab if one was active before switch", async () => { ... });
    it("activates workspace's marked-active tab otherwise", async () => { ... });
  });

  describe("bookmarking", () => {
    it("moves tab from ephemeral to bookmarked on toggle", async () => { ... });
    it("moves tab from bookmarked to ephemeral on toggle", async () => { ... });
    it("does nothing when toggling bookmark on pinned tab", async () => { ... });
  });

  describe("ephemeral tab cleanup", () => {
    it("removes ephemeral tabs older than 8h on startup", async () => { ... });
    it("keeps ephemeral tabs younger than 8h", async () => { ... });
  });
});
```

```tsx
// tabs.renderer.test.tsx
describe("tab list UI", () => {
  describe("interactions", () => {
    it("activates tab on click", async () => { ... });
    it("shows close button, closes tab on click", async () => { ... });
    it("toggles bookmark on Ctrl-B", async () => { ... });
  });

  describe("drag and drop", () => {
    it("reorders tabs within group", async () => { ... });
    it("moves tab between bookmarked and ephemeral groups", async () => { ... });
  });
});
```

```ts
// e2e/tests/tabs/workflows.spec.ts
test.describe("tab workflows", () => {
  test("open a page: create tab via command palette", async ({ ... }) => { ... });
  test("switch tabs: click sidebar tab", async ({ ... }) => { ... });
  test("close a tab: sidebar close button, next tab activates", async ({ ... }) => { ... });
  test("switch workspace: tab list updates", async ({ ... }) => { ... });
  test("bookmark current tab: moves between lists", async ({ ... }) => { ... });
});
```

## Worked Example: Tabs Feature

Source: `docs/features/TabsFeature.specs.md`

### Requirements → Test Cases

| Requirement | Test | Tier |
|---|---|---|
| "Creating a new tab opens the requested address via a new WebContentsView" | `tabs:create` handler calls `platform.createTab` with correct URL | Unit |
| "Activating a tab shows that tab's WebContentsView" | `tabs:activate` handler calls `platform.showView` / `platform.hideView` | Unit |
| "Tab switching is done by showing/hiding views, not destroying/creating" | `tabs:activate` does NOT call `platform.destroyView` | Unit |
| "Closing a tab destroys the WebContentsView" | `tabs:close` handler calls `platform.destroyView` | Unit |
| "Toggling bookmark on pinned tab does nothing" | `tabs:toggle-bookmark` is no-op when tab is pinned | Unit |
| "Ephemeral tabs older than 8h removed on startup" | startup function filters tabs by `lastAccessedAt` | Unit |
| "Click a tab to make it active" | clicking tab sends `tabs:activate` command | Component |
| "Click the tab's close button" | clicking close button sends `tabs:close` command | Component |
| "Ctrl-B toggles bookmark" | keyboard shortcut sends `tabs:toggle-bookmark` | Component |
| "Open a page" (full workflow) | command palette → type URL → Enter → tab appears | E2E |
| "Close a tab" (full workflow) | close button → tab removed → next tab activates | E2E |

### Adding to an Existing Feature

When adding new functionality (e.g. "tab pinning from context menu"):

1. Add the new requirement to the feature spec
2. Add new `describe` block or new `it` cases in existing test files
3. Never modify existing test assertions unless the spec requirement changed
4. If the feature touches another feature's domain, add integration tests

## Feature Spec → Test Checklist Template

Copy this for each feature you implement:

```markdown
## {Feature} Test Checklist

### Unit Tests (`{feature}.main.test.ts`)
- [ ] Command: `{feature}:{command1}` — handler logic
- [ ] Command: `{feature}:{command2}` — handler logic
- [ ] Event: `{feature}:{event1}` — emitted at correct time with correct payload
- [ ] Edge case: {describe}
- [ ] Edge case: {describe}

### Component Tests (`{feature}.renderer.test.tsx`)
- [ ] Renders correct initial state
- [ ] Click interaction: {describe}
- [ ] Keyboard shortcut: {describe}
- [ ] State change: {describe}
- [ ] Accessibility: correct ARIA roles and labels

### Store Tests (`{feature}.store.test.ts`)
- [ ] Initial state
- [ ] State transitions on events
- [ ] Derived/computed state

### E2E Tests (`e2e/tests/{feature}/`)
- [ ] Workflow: {name from spec}
- [ ] Workflow: {name from spec}
- [ ] Cross-feature: {describe interaction}
```

## Features and Implementation Status

20 feature specs in `docs/features/`. Features with existing tests:

| Feature | Unit Tests | Component Tests | E2E Tests |
|---|---|---|---|
| Sidebar | — | `sidebar.renderer.test.tsx` (49 tests) | — |
| Window Chrome | `window-chrome.test.ts` (23 tests) | — | — |
| Tooltip | — | `TooltipLayer.test.tsx` (5 tests) | — |
| Tabs | — | — | — |
| Workspaces | — | — | — |
| Command Palette | — | — | — |
| Pinned Tabs | — | — | — |
| All others | — | — | — |

Infrastructure tests (always passing):

| Module | File | Tests |
|---|---|---|
| Event Bus | `event-bus.test.ts` | 5 |
| Command Bus | `command-bus.test.ts` | 6 |
| Memory Store | `memory-store.test.ts` | 24 |
| JSON Store | `store.test.ts` | 16 |
