# Documentation

- Overview & tech stack: docs/spec/overview.md
- Architecture (buses, abstractions, process boundary, components): docs/spec/architecture.md
- Implementation details (tabs, extensions, lifecycle, multi-window, storage): docs/spec/implementation.md
- Project phases / roadmap: docs/spec/phases.md
- Dependencies & build/distribution: docs/spec/dependencies.md
- Resolved decisions, performance targets, constraints: docs/spec/decisions.md
- Feature specs (19 features): docs/features/

# Development

- `bun dev` — start dev server + Electron (Linux/WSLg)
- `bun run dev:win` — build in WSL, run Electron natively on Windows
- `bun run verify` — run all checks (typecheck + lint + tests)

# Verification

Always verify your work compiles and passes checks. Run `bun run verify` for a full check (typecheck, lint, tests). The pre-commit hook runs this automatically, so don't run it redundantly right before committing.

Always run the application to verify styling changes. Do not assume that CSS changes are correct without verifying.
