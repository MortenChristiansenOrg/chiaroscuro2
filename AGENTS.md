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

# Development

- `bun dev` — start dev server + Electron (Linux/WSLg)
- `bun run dev:win` — build in WSL, run Electron natively on Windows
- `bun run verify` — run all checks (typecheck + lint + tests)

The UI must adhere to the design system defined in the companion website found in the design-system folder.

For each logically distinct part of the UI, separate it into a React component. Add a page for the component in the design system and make sure the component follow all the requirements from the design system. The component pages in the design system must map to actual components, not just conceptual components.

# Verification

Always verify your work compiles and passes checks. Run `bun run verify` for a full check (typecheck, lint, tests). The pre-commit hook runs this automatically, so don't run it redundantly right before committing.

Always run the application to verify styling changes. Do not assume that CSS changes are correct without verifying.
