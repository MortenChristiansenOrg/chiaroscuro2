---
name: ui-review
description: Review the app's UI/UX by launching it, taking screenshots, checking console/network errors, and evaluating visual design + interaction quality. Use with /ui-review [FEATURE_OR_AREA].
---

# Goal

Perform a comprehensive UI/UX review of the running Chiaroscuro app **or the design system website** using the Playwright MCP server. Verify behavior, visual quality, UX, and error-free operation.

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
| URL           | Electron window (no URL)                | `http://localhost:5200`        |
| Launch        | `launch-app.sh`                         | `launch-docs.sh`              |
| Teardown      | `teardown-app.sh`                       | `teardown-docs.sh`            |
| Browser       | Electron (built-in)                     | Edge with CDP                  |
| Build         | `electron-vite build` + sync to Windows | `bun run docs:dev --host`     |
| Window chrome | Yes (custom title bar)                  | No                            |

Both targets expose CDP on port 9333 which the Playwright MCP server connects to directly via WSL2 mirrored networking.

## Prerequisites

Playwright MCP must be configured to connect to the app's CDP endpoint. Add to your MCP config:

```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest", "--cdp-url", "http://127.0.0.1:9333"]
  }
}
```

## WSL Environment Setup

This project runs in WSL2 with `networkingMode=mirrored`. WSL and Windows share the same port space, so the Playwright MCP server on WSL can reach the Windows-side browser's CDP endpoint directly at `127.0.0.1:9333`.

**Architecture:**

```text
Playwright MCP (WSL) → 127.0.0.1:9333 → Browser CDP (Windows)
```

No CDP proxy is needed.

### Starting the app (Electron)

```bash
.claude/skills/ui-review/scripts/launch-app.sh          # build if needed + launch
.claude/skills/ui-review/scripts/launch-app.sh --rebuild # force rebuild
```

### Starting the design system (Edge)

```bash
.claude/skills/ui-review/scripts/launch-docs.sh
```

### Stopping

```bash
# For app reviews:
.claude/skills/ui-review/scripts/teardown-app.sh

# For design system reviews:
.claude/skills/ui-review/scripts/teardown-docs.sh
```

### One-time setup (optional, for virtual desktop isolation)

```powershell
Install-Module VirtualDesktop -Scope CurrentUser -Force
```

### Verifying connectivity

```bash
curl -s http://127.0.0.1:9333/json/version
```

## Workflow

### Phase 0: Connect

1. Run the appropriate launch script and wait for confirmation:
   - **App:** `launch-app.sh`
   - **Design system:** `launch-docs.sh`
2. Use `browser_snapshot` to confirm the connection and see the current page
3. Take an initial screenshot with `browser_take_screenshot` to confirm visuals

If the review was invoked with a specific feature/area/page, navigate to the relevant view before proceeding.

**Design system navigation:** Use `browser_navigate` to go to specific pages (e.g., `http://localhost:5200/colors`), or click sidebar links.

### Phase 1: Behavior Verification

Verify that implemented features work correctly.

**For app reviews:**

1. **Read the spec** — Check `docs/features/` for the relevant spec file
2. **Walk through workflows** — Execute each workflow from the spec:
   - Use `browser_click`, `browser_type`, `browser_press_key` to simulate user actions
   - Take screenshots after each significant state change
   - Verify expected outcomes match spec requirements
3. **Test edge cases** — Empty states, long text, rapid interactions
4. **Test keyboard shortcuts** — Verify any shortcuts defined in the spec

**For design system reviews:**

1. **Check route coverage** — Verify all routes in `design-system/src/routes.ts` are navigable
2. **Walk through pages** — Visit each page via sidebar navigation:
   - Verify content renders (MDX, code blocks, examples)
   - Check interactive components (previews, toggles, swatches)
   - Verify code syntax highlighting works
3. **Test sidebar navigation** — Active state, group headers, scroll behavior
4. **Test theme toggle** — Light/dark mode switching, persistence

**Tools to use:**

- `browser_take_screenshot` — after each action to verify visual state
- `browser_snapshot` — to verify element existence/state when screenshot is ambiguous
- `browser_click`, `browser_type`, `browser_press_key` — to simulate user interactions
- `browser_evaluate` — to check app state programmatically if needed

### Phase 2: Visual Design Review

Evaluate visual quality. Apply the principles from the `frontend-design` skill.

**Take full-page screenshots and evaluate:**

1. **Typography** — Are fonts distinctive and readable? Consistent hierarchy? Avoid generic system font stacks without intentional styling.
2. **Color & contrast** — Cohesive palette? Sufficient contrast for readability (poor contrast = bad UX for everyone, not an a11y concern)? Dark/light mode consistency?
3. **Spacing & layout** — Consistent spacing rhythm? Proper alignment? Nothing cramped or floating in excess whitespace?
4. **Visual hierarchy** — Clear primary/secondary/tertiary importance? User's eye guided to the right place?
5. **Polish** — Hover states, transitions, focus indicators, loading states. No raw unstyled elements.
6. **Responsive behavior** — Resize the window to test narrow/wide layouts:
   ```
   browser_resize width=800 height=600
   browser_resize width=1920 height=1080
   browser_resize width=1280 height=720
   ```

**Design system specific:**

- Verify color swatches render correctly and show accurate values
- Check component previews match actual app component appearance
- Verify code blocks have proper syntax highlighting
- Check MDX prose styling (headings, lists, links, tables)

### Phase 3: UX Review

Evaluate interaction quality and efficiency.

1. **Task efficiency** — Count clicks/keystrokes for common tasks. Identify unnecessary steps. Can the user accomplish goals with minimal interaction?
2. **Discoverability** — Are actions findable? Proper labels, icons, tooltips? Would a new user understand what to do?
3. **Feedback** — Does the UI respond to actions? Loading indicators, success/error states, hover effects?
4. **Consistency** — Same patterns used for similar actions? Buttons look/behave the same way?
5. **Error states** — What happens on invalid input? Network failure? Empty data?
6. **Navigation flow** — Is it clear where you are? Can you go back? Breadcrumbs or other wayfinding?
7. **Keyboard navigation** — Can primary workflows be completed without mouse?

**Design system specific:**

- Is the sidebar navigation intuitive? Are pages grouped logically?
- Can users quickly find the component/token they need?
- Are examples copy-pasteable and clearly presented?

### Phase 4: Error Audit

Check for hidden errors that the user wouldn't see.

**Console errors:**

```
browser_console_messages
```

- Distinguish between: app errors (bugs), expected warnings, third-party noise
- Check for React rendering errors, unhandled promise rejections, failed imports

**Network errors:**

```
browser_network_requests
```

- Check for failed requests (4xx, 5xx status codes)
- Check for unexpectedly slow requests
- Look for CORS issues or blocked resources

**Runtime state:**

- Use `browser_evaluate` to check for:
  - Uncaught error handlers: `window.__errorCount || 'none'`
  - DOM size: `document.querySelectorAll('*').length`
  - React errors in dev mode

### Phase 5: Cross-Cutting Concerns

1. **Performance feel** — Does the UI feel snappy? Any visible jank or delayed renders?
2. **State persistence** — Navigate away and back. Is state preserved correctly?
3. **Window chrome integration** — _(App only)_ Does the custom title bar work? Minimize/maximize/close? Draggable regions?

### Phase 6: Teardown

After collecting all findings, tear down:

```bash
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
- When something looks wrong, take a snapshot too to understand the DOM structure
- Resize to multiple viewport sizes during visual review
- If the app has multiple windows, review each one via `browser_tabs`
- For design system reviews, check each page in the sidebar — don't just review the landing page
