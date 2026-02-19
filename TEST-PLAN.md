# Test Coverage Gap Analysis

## Current State

23 test files, 273 test cases. Infrastructure (buses, data stores), all 6 stores, all main-process features, renderer components, and pure function helpers are covered.

---

## Gap 1: Zero E2E Tests

Playwright config exists, `e2e/` directory structure is documented in detail, but **no E2E tests, page objects, or fixtures have been written**. The docs define specific workflow tests for tabs, sidebar, command palette — none exist.

Requires a running Electron app — separate effort from unit/component tests.

## Gap 2: Shell / App Composition Untested

`Shell.tsx` and `App.tsx` (top-level composition, layout orchestration) have no component tests. These are integration-heavy and may be better covered by E2E tests than unit tests.

## Gap 3: Sidebar Container Untested

The outer `Sidebar` container (layout, scroll, section headers) has no dedicated test — only `TabItem` and drag-reorder within it are tested. The container's resize handle, collapse/expand, and scroll behavior are uncovered.
