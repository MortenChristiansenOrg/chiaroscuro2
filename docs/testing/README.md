# Testing

Thorough test coverage is a project requirement. Every implemented feature must have tests covering its spec requirements.

## Docs

| Document | Contents |
|---|---|
| [Strategy](./strategy.md) | Test tiers, what to test, what not to test, coverage goals |
| [Unit & Component Tests](./unit-and-component-tests.md) | Vitest + React Testing Library patterns, mocking, accessibility |
| [E2E Tests](./e2e-tests.md) | Playwright + Electron, page object model, fixtures |
| [Feature Test Guide](./feature-test-guide.md) | How to write tests for a feature spec, with worked example |
| [Test Organization](./test-organization.md) | File layout, naming, shared utilities, avoiding conflicts |

## Quick Reference

```bash
bun test              # run all unit/component tests once
bun test:watch        # watch mode
bun run verify        # full pipeline (typecheck + lint + test)
```

## Test Stack

| Layer | Tool | Environment |
|---|---|---|
| Main-process unit tests | Vitest | Node |
| Renderer component tests | Vitest + React Testing Library | jsdom |
| E2E tests | Playwright + Electron | Real Electron app |

## Config Files

- `vitest.config.ts` — two projects: `main` (node) and `renderer` (jsdom)
- `playwright.config.ts` — testDir `./e2e`, 30s timeout, retries on failure
