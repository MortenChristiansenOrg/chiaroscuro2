---
name: ui-review
description: Review the app's UI/UX by launching it, taking screenshots, checking console/network errors, and evaluating visual design + interaction quality. Use with /ui-review [FEATURE_OR_AREA].
---

# Goal

Perform a comprehensive UI/UX review of the running Chiaroscuro app **or the design system website** using `playwright-cli`. Verify behavior, visual quality, UX, and error-free operation.

## Invocation

- `/ui-review` — Full app review
- `/ui-review <feature-or-area>` — Focused review (e.g., `/ui-review tabs`, `/ui-review settings`)
- `/ui-review design-system` — Full design system website review
- `/ui-review design-system <page>` — Focused review (e.g., `/ui-review design-system colors`)

## Review Targets

There are two review targets with different launch procedures:

|               | **App**                                 | **Design System**              |
| ------------- | --------------------------------------- | ------------------------------ |
| What          | Electron browser app                    | Vite-served documentation site |
| Launch        | `launch-app.sh`                         | `launch-docs.sh`              |
| Teardown      | `teardown-app.sh`                       | `teardown-docs.sh`            |
| Build         | `electron-vite build` + sync to Windows | `bun run docs:dev --host`     |
| Window chrome | Yes (custom title bar)                  | No                            |

## Prerequisites

`playwright-cli` must be installed globally (already on `PATH`). No MCP configuration needed.

## Browser Interaction via `playwright-cli`

All browser interaction uses `playwright-cli` via the Bash tool. The CLI manages its own headless Chromium browser with persistent sessions.

### Key commands

```bash
# Browser lifecycle
playwright-cli open [url]             # open browser (optionally navigate)
playwright-cli close                  # close browser
playwright-cli goto <url>            # navigate to URL

# Page inspection
playwright-cli snapshot              # get page accessibility tree with element refs
playwright-cli screenshot            # screenshot current page
playwright-cli screenshot <ref>      # screenshot specific element
playwright-cli screenshot --full-page # full scrollable page

# Interaction (refs come from snapshot output)
playwright-cli click <ref>           # click element
playwright-cli fill <ref> <text>     # fill input
playwright-cli type <text>           # type text into focused element
playwright-cli press <key>           # press key (e.g., Enter, ArrowDown)
playwright-cli hover <ref>           # hover over element
playwright-cli select <ref> <val>    # select dropdown option
playwright-cli resize <w> <h>        # resize viewport

# Debugging
playwright-cli console               # list console messages
playwright-cli console error         # errors only
playwright-cli network               # list network requests
playwright-cli eval '<func>'         # evaluate JS on page

# Tabs
playwright-cli tab-list              # list tabs
playwright-cli tab-new [url]         # open new tab
playwright-cli tab-close [index]     # close tab
```

### Workflow pattern

1. Take a `snapshot` to get element refs
2. Use refs to `click`, `fill`, `hover` etc.
3. Take `screenshot` to verify visual state
4. Read the screenshot image file with the Read tool to see the result
5. Repeat

## WSL Environment Setup

This project runs in WSL2. The Electron app runs on Windows.

### Starting the app (Electron)

The launcher builds, syncs to Windows, and launches Electron on a separate virtual desktop.

```bash
.claude/skills/ui-review/scripts/launch-app.sh          # build if needed + launch
.claude/skills/ui-review/scripts/launch-app.sh --rebuild # force rebuild
```

After Electron launches, start `playwright-cli` separately to review the renderer UI:

```bash
playwright-cli open http://localhost:5173  # Vite dev server for renderer
```

> **Note:** `playwright-cli` opens its own browser — it does not connect to the Electron window. Use it to review renderer UI (layout, components, interactions). Electron-specific features (native title bar, window chrome, WebContentsView) must be verified manually or via the Electron window directly.

### Starting the design system

```bash
.claude/skills/ui-review/scripts/launch-docs.sh
```

Then open in `playwright-cli`:

```bash
playwright-cli open http://localhost:5200
```

### Stopping

```bash
# Close playwright-cli browser:
playwright-cli close

# For app reviews:
.claude/skills/ui-review/scripts/teardown-app.sh

# For design system reviews:
.claude/skills/ui-review/scripts/teardown-docs.sh
```

### One-time setup (optional, for virtual desktop isolation)

```powershell
Install-Module VirtualDesktop -Scope CurrentUser -Force
```

## Workflow

### Phase 0: Connect

1. Run the appropriate launch script and wait for confirmation
2. Open the target in `playwright-cli`:
   - **App:** `playwright-cli open http://localhost:5173`
   - **Design system:** `playwright-cli open http://localhost:5200`
3. Run `playwright-cli snapshot` to confirm the page loaded
4. Run `playwright-cli screenshot` and read the image to confirm visuals

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

```bash
playwright-cli close

# App:
.claude/skills/ui-review/scripts/teardown-app.sh

# Design system:
.claude/skills/ui-review/scripts/teardown-docs.sh
```

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

- Save screenshots to the scratchpad directory, not the project
- Take screenshots liberally — they're the primary evidence
- Always `snapshot` before interacting to get fresh element refs
- When something looks wrong, take a snapshot too to understand the DOM structure
- Resize to multiple viewport sizes during visual review
- Use `--full-page` on screenshots to capture scrollable content
- For design system reviews, check each page in the sidebar — don't just review the landing page
