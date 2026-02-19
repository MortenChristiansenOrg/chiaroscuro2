# Test Strategy

## Test Tiers

Three tiers, each with a distinct purpose:

### Unit Tests

Feature tested with `MockPlatform` + `InMemoryDataStore` (RxDB Memory RxStorage). No Electron dependency. Verify command handling and event emission in isolation.

**Scope:** pure functions, command handlers, event bus wiring, store logic, data layer operations.

### Component Tests (Integration)

React components rendered in jsdom with mocked `window.chiaroscuro` bridge. Verify that UI responds correctly to user interactions and state changes.

**Scope:** renderer components, Zustand store subscriptions, keyboard/mouse interactions, accessibility.

### E2E Tests

Real Electron app driven by Playwright. Cover primary user workflows from feature specs. Full stack from UI through platform to persisted state.

**Scope:** multi-step user flows, cross-feature interactions, persistence round-trips.

## What to Test (Priority Order)

1. **User-visible behavior** — click X, see Y; type Z, list filters
2. **Critical business logic** — command handlers, state transformations, data mutations
3. **Edge cases** — empty states, error states, boundary conditions
4. **Cross-feature integration** — features communicating via command/event bus
5. **Accessibility** — keyboard navigation, ARIA attributes, focus management

## What NOT to Test

- Implementation details (internal state values, private methods)
- That React hooks or third-party libraries work
- Styling/layout at the unit level (use E2E screenshot comparison)
- Pure type definitions and constants (`.shared.ts` files with no runtime logic)
- Barrel files / re-exports

## Coverage Goals

Start conservative, ratchet up as coverage improves. Never lower thresholds.

| Metric | Initial Target | Long-term Target |
|---|---|---|
| Lines | 60% | 80%+ |
| Functions | 60% | 80%+ |
| Branches | 50% | 70%+ |

Use `perFile: true` in coverage config to prevent one well-tested file from masking an untested file. Don't pursue 100% — the cost/benefit ratio drops sharply above 85%.

## Testing by File Type

| File | How to Test |
|---|---|
| `.shared.ts` | Pure types/constants — no runtime tests needed |
| `.store.ts` | Test the store directly (zustand `getState`/`setState`), or via `renderHook`, or via component that consumes it |
| `.main.ts` | Unit test command handlers directly with `MockPlatform` + `InMemoryDataStore` |
| `.renderer.tsx` | React Testing Library component tests in jsdom |
| `.feature.ts` | Integration test: wire multiple features, verify cross-feature flows |

## Feature Requirement Coverage

Every implemented feature must have tests that map to its spec requirements. See [Feature Test Guide](./feature-test-guide.md) for details.
