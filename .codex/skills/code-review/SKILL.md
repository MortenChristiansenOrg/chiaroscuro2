---
name: code-review
description: Performs comprehensive code review of changes in user defined scope. Use with /code-review or when user asks to review their changes.
invocation: user
---

# Goal

Review all changes in scope across multiple dimensions using specialized sub-agents. If user doesn't specify a scope, review all uncommitted changes.

## Workflow

1. Create tasks for each review dimension
2. Launch sub-agents to handle each task in parallel
3. Collect and summarize findings

## Review Dimensions

Each dimension is handled by its own sub-agent:

| Dimension          | Focus                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Design System      | Conformance to design-system/ docs — tokens, patterns, component specs                                             |
| Spec Conformance   | Does implementation match the feature specs in docs/features/?                                                     |
| Code Quality       | Readability, maintainability, architecture, React/Electron patterns                                                |
| Test Coverage      | Missing tests, test quality, coverage gaps                                                                         |
| Security           | Injection, XSS, auth issues, secrets exposure, OWASP top 10, Electron-specific (nodeIntegration, contextIsolation) |
| Performance        | Unnecessary renders, bundle size, lazy loading, IPC overhead                                                       |
| UX & Accessibility | Keyboard navigation, focus management, loading states, error handling, ARIA, contrast                              |
| Task Completion    | Does the code actually solve the intended task? Edge cases covered?                                                |

## Instructions

When invoked:

1. **Get uncommitted changes**

   ```bash
   git diff HEAD
   git status
   ```

2. **Create task list** using TaskCreate for each review dimension

3. **Launch parallel sub-agents** using the Task tool with subagent_type="general-purpose" for each dimension.

   Each agent gets the specific prompt below for its dimension. All agents should:
   - Use relevant git operations to see changes
   - Focus only on their dimension
   - Be concise — only report actual issues
   - Reference specific file:line when reporting issues
   - Output a markdown section with: Summary (1-2 sentences), Issues (bullet list), Recommendations (bullet list)

### Design System Agent Prompt

```text
Review uncommitted changes for DESIGN SYSTEM CONFORMANCE.

Use relevant git operations to see changes, then check against the design system docs in design-system/src/pages/.

Check these rules (read the relevant design-system pages for specifics):

**Colors & Tokens** (design-system/src/pages/colors.mdx, src/renderer/src/assets/tokens.css)
- All colors must use oklch — no hex, rgb, or hsl
- Use CSS custom properties from tokens.css, never raw values
- Glass context vs content context colors used correctly
- Accent colors use the workspace hue system

**Typography** (design-system/src/pages/typography.mdx)
- Font sizes use the 6-step scale tokens (--font-size-*)
- Correct font family (Plus Jakarta Sans for UI, JetBrains Mono for code)
- Weight and tracking rules followed

**Spacing** (design-system/src/pages/spacing.mdx)
- Spacing uses semantic tokens (--space-*)
- Gap vs padding rules followed
- Chrome density vs content density

**Borders & Radius** (design-system/src/pages/borders-radius.mdx)
- Border radius uses scale tokens (--radius-*)
- Nesting radius rules followed
- 1px borders only

**Shadows & Effects** (design-system/src/pages/shadows-effects.mdx)
- Shadow scale tokens used correctly
- Backdrop blur rules (single translucent layer only)

**Interaction** (design-system/src/pages/interaction.mdx)
- 6-state ladder: default→hover→active→selected→disabled→focus-visible
- Close button patterns
- Transition/motion tokens used

**Motion** (design-system/src/pages/motion.mdx)
- Duration and easing tokens from tokens.css
- GPU-safe properties only (transform, opacity)
- Reduced motion support via prefers-reduced-motion

**Icons** (design-system/src/pages/icons.mdx)
- Uses typed <Icon> component, not bare FA classes
- Correct icon styles (solid/regular/brands)

**Layout** (design-system/src/pages/layout.mdx)
- Three-layer composition followed
- Z-index scale from tokens

**Components** (design-system/src/pages/components/*.mdx)
- If changed components have a design-system spec page, verify conformance to documented anatomy, states, variants, and keyboard behavior

Be concise. Only report actual issues.
```

### Spec Conformance Agent Prompt

```text
Review uncommitted changes for FEATURE SPEC CONFORMANCE.

Use relevant git operations to see what changed. Identify which features are touched.

For each touched feature, read its spec in docs/features/:
- TabsFeature.specs.md
- PinnedTabsFeature.specs.md
- SidebarFeature.specs.md
- CommandPaletteFeature.specs.md
- WorkspacesFeature.specs.md
- CustomWindowChromeFeature.specs.md
- DevToolFeature.specs.md
- ZoomFeature.specs.md
- FindTextFeature.specs.md
- SettingsFeature.specs.md
- DragDropFeature.specs.md
- FoldersFeature.specs.md
- FileDownloadsFeature.specs.md
- DomainCustomizationFeature.specs.md
- TabCustomizationFeature.specs.md
- LocalWebAppFeature.specs.md
- TerminalFeature.specs.md
- AppStateFeature.specs.md
- TabPaletteFeature.specs.md
- ActionDialogFeature.specs.md (legacy name for CommandPalette)

Check:
- Does the implementation match the spec's Requirements section?
- Are the described Workflows implemented correctly?
- Do Commands & Events match what the spec describes?
- Are Interactions (keyboard shortcuts, mouse behavior) correct?
- Any contradictions between code and spec?

Note: Not all features are implemented yet. Only check specs for features that the changes actually touch. Don't flag unimplemented features — only flag implemented behavior that contradicts its spec.

Be concise. Only report actual issues.
```

### Code Quality Agent Prompt

```text
Review uncommitted changes for CODE QUALITY.

Use relevant git operations to see changes.

Check:
- Readability and maintainability
- Consistent patterns with rest of codebase
- Proper TypeScript usage (no any, proper generics, discriminated unions)
- React patterns (proper hooks usage, no stale closures, correct deps arrays)
- Electron patterns (proper IPC, preload script boundaries, context isolation)
- Feature communication via commands & events pattern
- No dead code or unused imports
- Proper error handling at system boundaries

Be concise. Only report actual issues.
```

### Security Agent Prompt

```text
Review uncommitted changes for SECURITY.

Use relevant git operations to see changes.

Check:
- Electron-specific: nodeIntegration must be false, contextIsolation must be true, webSecurity settings
- No secrets/credentials in code
- IPC message validation
- URL/input sanitization
- XSS vectors in rendered content
- OWASP top 10 where applicable
- Permissions and session isolation (per-tab partitions)

Be concise. Only report actual issues.
```

4. **Skip irrelevant dimensions** — e.g., skip Security for pure CSS changes, skip Design System for main-process-only changes

5. **Collect results** and compile into unified report

6. **Mark tasks complete** as each agent finishes

## Output Format

```markdown
# Code Review Summary

## Overview

[1-2 sentence summary of changes]

## Design System Conformance

[Agent findings]

## Spec Conformance

[Agent findings]

## Code Quality

[Agent findings]

## Test Coverage

[Agent findings]

## Security

[Agent findings]

## Performance

[Agent findings]

## UX & Accessibility

[Agent findings]

## Task Completion

[Agent findings]

## Action Items

- [ ] Critical: ...
- [ ] Important: ...
- [ ] Minor: ...
```

## Notes

- Skip dimensions not relevant to the changes
- Reference specific file:line when reporting issues
- Design system docs live in `design-system/src/pages/` (MDX files)
- Feature specs live in `docs/features/` (Markdown files)
- CSS tokens live in `src/renderer/src/assets/tokens.css`
- Tailwind theme mapping in `src/renderer/src/assets/theme.css`
