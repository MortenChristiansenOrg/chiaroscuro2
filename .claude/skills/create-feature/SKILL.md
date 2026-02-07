---
name: create-feature
description: Create a new feature for the Chiaroscuro browser. Orchestrates spec writing, planning, implementation, testing, and architecture review using sub-agents. Use with /create-feature <FEATURE_NAME> <DESCRIPTION>.
invocation: user
---

# Goal

Create a complete new feature for the Chiaroscuro browser following the feature-based architecture. Orchestrates sub-agents to plan, implement, test, and review the feature.

## Invocation

- `/create-feature <FEATURE_NAME> <DESCRIPTION>` — e.g. `/create-feature history "Browse and search navigation history"`

If no arguments provided, ask the user for the feature name and a brief description.

## Checklist

Work through each step sequentially. Use the Task tool with sub-agents to parallelize where noted. Mark each step complete before moving on. Use TodoWrite to track progress.

---

### Step 1: Gather Requirements

Ask the user clarifying questions about the feature:
- What user problem does it solve?
- What are the key workflows?
- Which existing features does it interact with?
- Does it need main-process logic, renderer UI, or both?
- Does it need persistent storage (RxDB collection)?
- What commands and events should it expose?

Proceed once requirements are clear.

---

### Step 2: Write Feature Spec

Create `docs/features/<FeatureName>Feature.specs.md` following this template:

```markdown
# Specification for <Feature Name> Feature

## Overview
Brief description of what the feature does and why.

## Terminology
- **Term**: Definition of domain terms used in this spec.

## Requirements
- Bullet list of functional requirements.
- Each requirement is testable and unambiguous.

## Workflows
### <Workflow Name>
Step-by-step user workflow description.

## Interactions
### Keyboard shortcuts
- **Shortcut**: Description.

### Mouse interactions
- **Action**: Description.

### Cross-feature interactions
- Which features this one communicates with and how.

## Commands & Events
### Commands
- `feature:command-name` — Description. Payload: `{ field: type }`.

### Events
- `feature:event-name` — Description. Payload: `{ field: type }`.

## Unresolved Issues
- Open questions or deferred decisions.
```

Present the spec to the user for review. Iterate until approved.

---

### Step 3: Plan Implementation

Launch a **Plan** sub-agent to design the implementation. The plan must cover:

**Feature directory**: `src/features/<feature-name>/`

**Files to create** (only include files the feature needs):

| File | Purpose |
|------|---------|
| `<feature>.shared.ts` | Command/event names, payload types, type registry maps |
| `<feature>.main.ts` | Main-process logic: command handlers, platform/data access, event emission |
| `<feature>.renderer.tsx` | React components for the feature's UI |
| `<feature>.store.ts` | Renderer-side Zustand store with event listeners |
| `<feature>.test.ts` | Unit tests with MockPlatform + InMemoryDataStore |

**Design decisions the plan must address:**
- Command and event type definitions (in `.shared.ts`)
- What state is authoritative (main-process) vs ephemeral (renderer-only)
- RxDB collection schema (if persistent storage needed)
- Which platform abstractions are needed
- How to register the feature in entry points
- Cross-feature interactions (command/event flows)
- Optimistic UI strategy (renderer-only, optimistic+confirm, or wait-for-main)

Present the plan to the user for approval before implementing.

---

### Step 4: Implement Shared Types

Create `src/features/<feature-name>/<feature>.shared.ts`:

- Define command name constants with `feature:` prefix
- Define event name constants with `feature:` prefix
- Define payload interfaces for each command and event
- Export command registry type map: `{ 'feature:command': PayloadType }`
- Export event registry type map: `{ 'feature:event': PayloadType }`

All command/event names are compile-time checked via the typed bus.

---

### Step 5: Implement Main-Process Logic

Create `src/features/<feature-name>/<feature>.main.ts`:

- Export a `register(bus, platform, data)` function for phase 1 (passive setup)
  - Register command handlers via `bus.handle('feature:command', handler)`
  - Register event listeners for cross-feature events
  - Register keyboard shortcut bindings (if any)
- Export a `start(bus, platform, data)` function for phase 2 (active logic)
  - Load persisted state from DataStore
  - Emit initial state events
  - Start background processes (timers, observers, etc.)
- Command handlers should:
  - Perform logic using Platform/DataStore abstractions
  - Emit outcome events (past-tense) on completion
  - Never import Electron directly — use Platform abstraction

---

### Step 6: Implement Renderer Store

Create `src/features/<feature-name>/<feature>.store.ts` (if feature has UI):

- Create Zustand store with `create<State>()`
- State split: authoritative fields (synced from main via events) + ephemeral UI fields
- Event listeners: subscribe to bus events, update authoritative state
- Export read-only selector hooks for cross-feature access
- All mutations go through commands (`bus.send()`), never direct store writes for authoritative state
- Use `useShallow` for multi-field selections
- Include `_optimistic` layer if optimistic updates are needed

---

### Step 7: Implement React Components

Create `src/features/<feature-name>/<feature>.renderer.tsx` (if feature has UI):

- Components read from feature's Zustand store via inline selectors
- User actions dispatch commands via `bus.send()`
- Use shadcn/ui components + Tailwind CSS 4 for styling
- Components are exported for Shell.tsx or other features to import
- No business logic in components — delegate to commands

---

### Step 8: Write Tests

Create `src/features/<feature-name>/<feature>.test.ts`:

Launch sub-agents in parallel for:

**Unit tests:**
- Test each command handler in isolation
- Use MockPlatform + InMemoryDataStore (RxDB Memory RxStorage)
- Verify correct events emitted for each command
- Verify state changes in DataStore
- Test edge cases and error conditions

**Integration tests** (if cross-feature interactions exist):
- Wire multiple features together with mocks
- Verify command/event flows between features

---

### Step 9: Register Feature

- Add feature to the manual registration list in `src/main/` entry point
- Add feature to the renderer entry point (if it has UI)
- Merge feature's command/event type maps into the global registry
- Verify the feature initializes in the two-phase startup (register then start)

---

### Step 10: Verify Implementation

Run all checks:

```bash
# Type checking
bun run typecheck

# Run feature's tests
bun test src/features/<feature-name>/

# Run full test suite to check for regressions
bun test

# Lint
bun run lint
```

Fix any failures before proceeding.

---

### Step 11: UI Review

If the feature has renderer UI (`<feature>.renderer.tsx`), perform a visual and behavioral review using the `ui-review` skill.

**Run the review:**

Invoke `/ui-review <feature-name>` (which launches the app, connects via CDP, and produces a structured review report with ratings and recommendations).

**Act on recommendations:**

1. **Auto-implement** any recommendation you judge to be clearly correct (e.g., missing hover states, broken styling, console errors, failed interactions).
2. **Collect uncertain recommendations** — any where the right call depends on taste, product direction, or tradeoffs you can't resolve alone — into a list.
3. If there are uncertain recommendations, present them to the user with AskUserQuestion (multiSelect) and let them pick which to implement. Implement the selected ones.
4. After all changes, re-run `bun test` and `bun run typecheck` to verify nothing broke.

**Skip this step** if the feature is main-process-only with no UI components.

---

### Step 12: Architecture Conformance Review

Launch a sub-agent to review the completed feature against the project architecture. This agent should read `SPEC.md` and verify:

**Structural conformance:**
- [ ] Feature lives in `src/features/<feature-name>/`
- [ ] Files follow naming convention: `.main.ts`, `.renderer.tsx`, `.shared.ts`, `.store.ts`, `.test.ts`
- [ ] No direct Electron imports in feature code (uses Platform abstraction)
- [ ] No direct RxDB/filesystem access (uses DataStore abstraction)
- [ ] Feature registered in entry points (no auto-discovery magic)

**Bus architecture:**
- [ ] Commands are imperative, one handler per command
- [ ] Events are past-tense, zero or more listeners
- [ ] Command/event names prefixed with `feature:`
- [ ] Payloads are typed in `.shared.ts` and compile-time checked
- [ ] Bus bridges IPC transparently — feature doesn't know which process it talks to

**State management:**
- [ ] Zustand store per feature (not global)
- [ ] Authoritative state owned by main process, synced via events
- [ ] Ephemeral UI state in Zustand store or React local state
- [ ] Read-only selector hooks exported; all mutations via commands
- [ ] Inline selectors used (`useStore(s => s.field)`)

**Two-phase startup:**
- [ ] `register()` has no side effects (only wiring handlers/listeners)
- [ ] `start()` only runs after all features complete registration

**Testability:**
- [ ] Tests use MockPlatform + InMemoryDataStore
- [ ] No Electron dependency in tests
- [ ] Command handling and event emission verified

**Technology best practices:**
- [ ] React 19 patterns (no deprecated APIs)
- [ ] TypeScript strict mode compliance
- [ ] Tailwind CSS 4 for styling (no inline styles or CSS modules)
- [ ] shadcn/ui components where applicable
- [ ] Zustand v5 patterns (inline selectors, useShallow for multi-field)

**Cross-cutting:**
- [ ] No security vulnerabilities (XSS, injection, etc.)
- [ ] Performance: no unnecessary re-renders, efficient subscriptions
- [ ] Feature spec in `docs/features/` matches implementation

Report any violations with specific file:line references and suggested fixes. Fix all issues before marking the feature complete.

---

## Error Handling

- If tests fail: analyze failures, fix, re-run. Don't skip tests.
- If type errors: fix types first — they catch real bugs.
- If architecture review finds violations: fix before completing.
- If UI review finds issues: fix clear bugs immediately, consult user on subjective items.
- If user rejects spec or plan: iterate based on feedback.

## Output

When complete, summarize:
- Feature name and description
- Files created
- Commands and events registered
- Test results
- UI review results (if applicable) and changes made
- Architecture review status
