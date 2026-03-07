# Documentation

- Overview & tech stack: docs/spec/overview.md
- Architecture (buses, abstractions, process boundary, components): docs/spec/architecture.md
- Implementation details (tabs, extensions, lifecycle, multi-window, storage): docs/spec/implementation.md
- Project phases / roadmap: docs/spec/phases.md
- Dependencies & build/distribution: docs/spec/dependencies.md
- Resolved decisions, performance targets, constraints: docs/spec/decisions.md
- Feature specs: docs/features/

# React Guidelines

- Component patterns (declarations, generics, composition, compound components): docs/react/components.md
- TypeScript + React (hook typing, events, extending props, React 19 changes): docs/react/typescript.md
- State management (decision framework, derived state, Zustand, Context, anti-patterns): docs/react/state.md
- Hooks (React 19 hooks, useEffect rules, useSyncExternalStore, custom hooks): docs/react/hooks.md
- Performance (React Compiler, structural patterns, code splitting, virtualization, profiling): docs/react/performance.md
- Project structure & conventions (file organization, module boundaries, naming, testing, a11y, error handling): docs/react/project-structure.md

# Testing

- Strategy (tiers, what to test): docs/testing/strategy.md
- Unit & component tests (Vitest, RTL, mocking): docs/testing/unit-and-component-tests.md
- E2E tests (Playwright, Electron, page object model): docs/testing/e2e-tests.md
- Feature test guide (mapping specs → tests, worked example): docs/testing/feature-test-guide.md
- Test organization (file layout, naming, shared utilities): docs/testing/test-organization.md

# Development

- `bun dev` — start dev server + Electron (Linux/WSLg)
- `bun run dev:win` — build in WSL, run Electron natively on Windows
- `bun run verify` — run all checks (typecheck + lint + tests)

The UI must adhere to the design system defined in the companion website found at design-system/.

For each logically distinct part of the UI, separate it into a React component. Add a page for the component in the design system and make sure the component follow all the requirements from the design system. The component pages in the design system must map to actual components, not just conceptual components.

# Keyboard Shortcuts

Register every shortcut via **both** `platform.registerShortcut` (OS-level `globalShortcut`, toggled on window focus/blur) **and** `platform.registerLocalShortcut` (`before-input-event` + menu accelerator). Using only one mechanism is unreliable on Windows with `titleBarStyle: "hidden"`. See `find-text.main.ts` for the pattern:

```ts
const callback = () => { commands.send(MY_COMMAND, undefined).catch(console.error); };
platform.registerShortcut("CommandOrControl+F", callback);
platform.registerLocalShortcut("CommandOrControl+F", callback);
```

Exception: shortcuts that conflict with OS global hotkeys (e.g. F12) should use only `registerLocalShortcut`.

CDP key events (playwright-cli `press`) do NOT trigger `before-input-event` or `globalShortcut` — keyboard shortcuts cannot be tested via CDP. Test them manually in the running app.

# Verification

Always verify your work compiles and passes checks. Run `bun run verify` for a full check (typecheck, lint, tests). The pre-commit hook runs this automatically, so don't run it redundantly right before committing.

Always browse the application to verify changes affecting the UI.
Do not assume that CSS changes are correct without verifying.
