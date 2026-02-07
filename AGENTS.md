# Development

- `bun dev` — start dev server + Electron (Linux/WSLg)
- `bun run dev:win` — build in WSL, run Electron natively on Windows
- `bun run verify` — run all checks (typecheck + lint + tests)

# Verification

Always verify your work compiles and passes checks. Run `bun run verify` for a full check (typecheck, lint, tests). The pre-commit hook runs this automatically, so don't run it redundantly right before committing.
