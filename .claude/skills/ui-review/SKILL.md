---
name: ui-review
description: Review the app's UI/UX by launching it, taking screenshots, checking console/network errors, and evaluating visual design + interaction quality. Use with /ui-review [FEATURE_OR_AREA].
---

# Goal

Perform a comprehensive UI/UX review of the running Chiaroscuro app **or the design system website**. Verify behavior, visual quality, UX, and error-free operation.

## Invocation

- `/ui-review` — Full app review
- `/ui-review <feature-or-area>` — Focused review (e.g., `/ui-review tabs`, `/ui-review settings`)
- `/ui-review design-system` — Full design system website review
- `/ui-review design-system <page>` — Focused review (e.g., `/ui-review design-system colors`)

## Prerequisites

Use the `browse-app` skill for all app launching, connecting, and browser interaction. Refer to its SKILL.md at `.claude/skills/browse-app/SKILL.md` for:

- Launch/teardown scripts and their usage
- `playwright-cli` command reference
- WSL environment setup
- Connect workflow

## Workflow

### Phase 0: Connect

Use the `browse-app` connect workflow to launch and connect to the target.

If the review was invoked with a specific feature/area/page, navigate with `playwright-cli goto <url>`.

### Phase 1: Behavior Verification

Verify that implemented features work correctly.

**For app reviews:**

1. **Read the spec** — Check `docs/features/` for the relevant spec file
2. **Walk through workflows** — Execute each workflow from the spec:
   - Use `snapshot` to find element refs, then `click`, `fill`, `press` to interact
   - Take screenshots after each significant state change
   - Verify expected outcomes match spec requirements
3. **Test edge cases** — Empty states, long text, rapid interactions
4. **Test keyboard shortcuts** — Verify any shortcuts defined in the spec

**For design system reviews:**

1. **Check route coverage** — Verify all routes in `design-system/src/routes.ts` are navigable
2. **Walk through pages** — Navigate via `goto` or click sidebar links:
   - Verify content renders (MDX, code blocks, examples)
   - Check interactive components (previews, toggles, swatches)
   - Verify code syntax highlighting works
3. **Test sidebar navigation** — Active state, group headers, scroll behavior
4. **Test theme toggle** — Light/dark mode switching, persistence

### Phase 2: Visual Design Review

Evaluate visual quality. Apply the principles from the `frontend-design` skill.

**Take full-page screenshots and evaluate:**

1. **Typography** — Distinctive and readable fonts? Consistent hierarchy?
2. **Color & contrast** — Cohesive palette? Sufficient contrast?
3. **Spacing & layout** — Consistent rhythm? Proper alignment?
4. **Visual hierarchy** — Clear primary/secondary/tertiary importance?
5. **Polish** — Hover states, transitions, loading states. No raw unstyled elements.
6. **Responsive behavior** — Resize to test different viewports:
   ```bash
   playwright-cli resize 800 600
   playwright-cli screenshot
   playwright-cli resize 1920 1080
   playwright-cli screenshot
   playwright-cli resize 1280 720
   playwright-cli screenshot
   ```

**Design system specific:**

- Verify color swatches render correctly and show accurate values
- Check component previews match actual app component appearance
- Verify code blocks have proper syntax highlighting
- Check MDX prose styling (headings, lists, links, tables)

### Phase 3: UX Review

Evaluate interaction quality and efficiency.

1. **Task efficiency** — Count clicks/keystrokes for common tasks. Identify unnecessary steps.
2. **Discoverability** — Are actions findable? Proper labels, icons, tooltips?
3. **Feedback** — Does the UI respond to actions? Loading indicators, success/error states, hover effects?
4. **Consistency** — Same patterns used for similar actions?
5. **Error states** — What happens on invalid input? Empty data?
6. **Navigation flow** — Is it clear where you are? Can you go back?
7. **Keyboard navigation** — Can primary workflows be completed without mouse?

### Phase 4: Error Audit

Check for hidden errors.

```bash
# Console errors:
playwright-cli console error

# Network requests (check for failures):
playwright-cli network

# Runtime state:
playwright-cli eval '() => document.querySelectorAll("*").length'
```

- Distinguish between: app errors (bugs), expected warnings, third-party noise
- Check for React rendering errors, unhandled promise rejections, failed imports
- Check for failed requests (4xx, 5xx), CORS issues

### Phase 5: Cross-Cutting Concerns

1. **Performance feel** — Does the UI feel snappy? Any visible jank?
2. **State persistence** — Navigate away and back. Is state preserved?
3. **Window chrome integration** — _(App only, verify in Electron window)_ Custom title bar, minimize/maximize/close, draggable regions

### Phase 6: Teardown

Use the `browse-app` teardown scripts to stop the app/design system.

## Output Format

```markdown
# UI Review: <area or "Full App" or "Design System" or "Design System: <page>">

## Summary

<1-2 sentence overall assessment>

## Behavior

| Feature/Workflow | Status            | Notes |
| ---------------- | ----------------- | ----- |
| ...              | PASS/FAIL/PARTIAL | ...   |

## Visual Design

**Rating: X/5**

- Strengths: ...
- Issues: ...

## UX

**Rating: X/5**

- Strengths: ...
- Issues: ...

## Errors Found

| Type                    | Severity        | Description |
| ----------------------- | --------------- | ----------- |
| console/network/runtime | high/medium/low | ...         |

## Recommendations

Prioritized list of fixes/improvements:

1. [HIGH] ...
2. [MED] ...
3. [LOW] ...

## Screenshots

Reference screenshots taken during review (saved to scratchpad directory).
```

## Tips

- Take screenshots liberally — they're the primary evidence
- Resize to multiple viewport sizes during visual review
- For design system reviews, check each page in the sidebar — don't just review the landing page
