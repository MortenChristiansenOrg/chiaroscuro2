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

**Design system compliance** — read `src/renderer/src/assets/tokens.css` for available tokens. All UI must follow these rules:

- **Icons:** Font Awesome 7 Free only (`<i className="fa-solid fa-icon-name" />`). No inline SVGs. Import is already in `main.tsx` via `@fortawesome/fontawesome-free/css/all.min.css`.
- **Color context:** Chrome/overlay UI uses glass tokens (`--glass-text-*`, `--glass-hover`, `--glass-active`, etc.). Content panel UI uses content tokens (`--content-bg`, `--foreground`, `--border`, etc.). Never mix contexts.
- **State ladder:** All interactive elements must implement: default → hover (`--glass-hover` / `--glass-text-hover`) → active/pressed (`--glass-pressed` / `--glass-text-pressed`). Use Tailwind classes: `hover:bg-glass-hover hover:text-glass-text-hover active:bg-glass-pressed active:text-glass-text-pressed`.
- **Typography:** Use token vars (`--text-xs`, `--text-sm`, `--text-base`, `--text-md`). Max 3 sizes per component. Fonts: `--font-sans` for UI, `--font-mono` for code/URLs.
- **Spacing:** Use rem or token vars, not hardcoded px. Gap tokens: `0.375rem` (related), `0.75rem` (section).
- **Border radius:** Use `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`, `--radius-full`. Children rounder than parents.
- **Shadows:** Only on elevated/active elements. Use `--shadow-subtle`, `--shadow-medium`, `--shadow-elevated`.
- **Motion:** Transitions use `--duration-fast` / `--duration-normal` + `--ease-out` / `--ease-in-out`. Overlays enter with scale 0.96→1. Never animate layout properties.
- **Z-index:** `--z-base` (0), `--z-content` (1), `--z-chrome` (10), `--z-overlay` (100), `--z-tooltip` (1000).
- **Tooltips:** Every icon-only button must have `data-tip="label"` and `aria-label`.
- **Click targets:** Minimum `--click-target-min` (1.5rem / 24px) for all interactive elements.

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

### Step 10: Document Components in Design System

If the feature introduces new UI components visible to the user, create or update design system documentation.

**When to create a new component page:**
- The feature adds a distinct, reusable UI element (e.g., a panel, dialog, bar, list)
- The component has its own visual specs, states, or interaction patterns

**When to update an existing page:**
- The feature adds a variant or state to an existing component (e.g., a new button type, a new tab state)

**Creating a new component page** — `design-system/src/pages/components/<component-name>.mdx`:

Read `design-system/src/pages/component-guide.mdx` for the full 12-section template. Every component page must include applicable sections from:

1. **Overview** — one-line description + where it appears
2. **Anatomy** — structural breakdown of sub-elements (composite components)
3. **Visual Preview** — `<ComponentPreview>` block with real tokens on dark bg (`var(--window-bg)`) for chrome components or content bg for content components
4. **Visual Specs** — token table: size, padding, gap, radius, bg, text, font, shadow, backdrop
5. **States** — full state ladder table (default, hover, active/pressed, selected, disabled, focus-visible) with tokens per state
6. **Variants** — if multiple types/modes exist
7. **Behavior** — click actions, reveal patterns, dismiss rules, overflow, loading
8. **Animation & Motion** — transitions, enter/exit, `prefers-reduced-motion` fallback
9. **Keyboard & Focus** — focus zone, key bindings, focus return, tab order
10. **Accessibility** — contrast, touch targets, ARIA, semantic HTML, live regions
11. **Layout & Composition** — parent, positioning, z-index, responsive
12. **Related** — links to other component/foundation pages

Use `import { ComponentPreview } from "../../components/ComponentPreview"` for previews.

**Add the route** in `design-system/src/routes.ts`:
```ts
{
  path: "/components/<component-name>",
  title: "<Component Name>",
  group: "Components",
  component: lazy(() => import("./pages/components/<component-name>.mdx")),
},
```

**Verify docs build:** `bun run docs:build` should succeed with no errors.

**Skip this step** if the feature is main-process-only or adds no new visible UI components.

---

### Step 11: Verify Implementation

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

### Step 12: UI Review

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

### Step 13: Architecture Conformance Review

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

**Design system compliance:**
- [ ] All icons use Font Awesome 7 Free (`<i>` elements) — no inline SVGs
- [ ] Colors reference design tokens from `tokens.css` — no hardcoded oklch/hex/rgb values
- [ ] Correct color context used (glass tokens for chrome/overlay, content tokens for panels)
- [ ] Full state ladder implemented on interactive elements (default → hover → active/pressed)
- [ ] Typography uses token vars (`--text-xs` through `--text-md`, `--font-sans`, `--font-mono`)
- [ ] Spacing uses rem or token vars, not hardcoded px
- [ ] Border radius uses token vars (`--radius-sm` through `--radius-full`)
- [ ] Z-index uses layered tokens (`--z-base` through `--z-tooltip`)
- [ ] Icon-only buttons have both `data-tip` and `aria-label`
- [ ] Interactive elements meet `--click-target-min` (24px) minimum size
- [ ] Component doc exists in `design-system/src/pages/components/` (if new visible component)
- [ ] Component doc follows 12-section guide from `component-guide.mdx`
- [ ] Component route added to `design-system/src/routes.ts`

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
- Design system docs created/updated (if applicable)
- UI review results (if applicable) and changes made
- Architecture review status
