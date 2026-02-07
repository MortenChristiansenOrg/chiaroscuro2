---
name: ui-review
description: Review the app's UI/UX by launching it, taking screenshots, checking console/network errors, and evaluating visual design + interaction quality. Use with /ui-review [FEATURE_OR_AREA].
invocation: user
---

# Goal

Perform a comprehensive UI/UX review of the running Chiaroscuro app using Chrome DevTools MCP. Verify behavior, visual quality, UX, and error-free operation.

## Invocation

- `/ui-review` — Full app review
- `/ui-review <feature-or-area>` — Focused review (e.g., `/ui-review tabs`, `/ui-review settings`)

## Prerequisites

Chrome DevTools MCP is configured globally at `http://127.0.0.1:9222`. The Electron app must be running with `--remote-debugging-port=9222`.

## WSL Environment Setup

This project runs in WSL2. Electron must launch on the Windows host. WSL2 uses NAT networking so it can't reach Windows' `127.0.0.1` directly — a two-hop CDP proxy bridges this gap.

**Architecture:**
```
Chrome DevTools MCP → WSL 127.0.0.1:9222 → [cdp-proxy] → Windows 0.0.0.0:9223 → 127.0.0.1:9222 (Electron CDP)
```

### Starting the app

The launcher handles everything: build, sync, launch on separate virtual desktop, start CDP proxy.

```bash
.claude/skills/ui-review/scripts/launch-app.sh          # build if needed + launch
.claude/skills/ui-review/scripts/launch-app.sh --rebuild # force rebuild
```

If the app is already running with CDP and just needs the proxy:
```bash
node .claude/skills/ui-review/scripts/cdp-proxy.mjs &
```

### One-time setup (optional, for virtual desktop isolation)

```powershell
Install-Module VirtualDesktop -Scope CurrentUser -Force
```

### Verifying connectivity

```bash
curl -s http://127.0.0.1:9222/json/version
```

## Workflow

### Phase 0: Connect

1. Run `check-cdp.sh` to verify the app is reachable
2. If not reachable, run `launch-app.sh` and wait for confirmation
3. Use `mcp__chrome-devtools__list_pages` to enumerate open pages
4. Use `mcp__chrome-devtools__select_page` to pick the main app window
5. Take an initial screenshot to confirm connection

If the review was invoked with a specific feature/area, navigate to the relevant view before proceeding.

### Phase 1: Behavior Verification

Verify that implemented features work correctly.

**For each feature or area under review:**

1. **Read the spec** — Check `docs/features/` for the relevant spec file
2. **Walk through workflows** — Execute each workflow from the spec:
   - Use `click`, `fill`, `press_key` to simulate user actions
   - Take screenshots after each significant state change
   - Verify expected outcomes match spec requirements
3. **Test edge cases** — Empty states, long text, rapid interactions
4. **Test keyboard shortcuts** — Verify any shortcuts defined in the spec

**Tools to use:**
- `take_screenshot` — after each action to verify visual state
- `take_snapshot` — to verify element existence/state when screenshot is ambiguous
- `click`, `fill`, `press_key` — to simulate user interactions
- `evaluate_script` — to check app state programmatically if needed

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
   mcp__chrome-devtools__resize_page width=800 height=600
   mcp__chrome-devtools__resize_page width=1920 height=1080
   mcp__chrome-devtools__resize_page width=1280 height=720
   ```

### Phase 3: UX Review

Evaluate interaction quality and efficiency.

1. **Task efficiency** — Count clicks/keystrokes for common tasks. Identify unnecessary steps. Can the user accomplish goals with minimal interaction?
2. **Discoverability** — Are actions findable? Proper labels, icons, tooltips? Would a new user understand what to do?
3. **Feedback** — Does the UI respond to actions? Loading indicators, success/error states, hover effects?
4. **Consistency** — Same patterns used for similar actions? Buttons look/behave the same way?
5. **Error states** — What happens on invalid input? Network failure? Empty data?
6. **Navigation flow** — Is it clear where you are? Can you go back? Breadcrumbs or other wayfinding?
7. **Keyboard navigation** — Can primary workflows be completed without mouse?

### Phase 4: Error Audit

Check for hidden errors that the user wouldn't see.

**Console errors:**
```
mcp__chrome-devtools__list_console_messages types=["error","warn"]
```
- For each error, use `get_console_message` to get full details
- Distinguish between: app errors (bugs), expected warnings, third-party noise
- Check for React rendering errors, unhandled promise rejections, failed imports

**Network errors:**
```
mcp__chrome-devtools__list_network_requests
```
- Check for failed requests (4xx, 5xx status codes)
- Check for unexpectedly slow requests
- Look for CORS issues or blocked resources
- Use `get_network_request` to inspect specific failures

**Runtime state:**
- Use `evaluate_script` to check for:
  - Uncaught error handlers: `() => window.__errorCount || 'none'`
  - Memory leaks (large detached DOM trees): `() => document.querySelectorAll('*').length`
  - React errors in dev mode

### Phase 5: Cross-Cutting Concerns

1. **Performance feel** — Does the UI feel snappy? Any visible jank or delayed renders? Use `performance_start_trace` if something feels slow.
2. **State persistence** — Navigate away and back. Is state preserved correctly?
3. **Window chrome integration** — Does the custom title bar work? Minimize/maximize/close? Draggable regions?

## Output Format

```markdown
# UI Review: <area or "Full App">

## Summary
<1-2 sentence overall assessment>

## Behavior
| Feature/Workflow | Status | Notes |
|---|---|---|
| ... | PASS/FAIL/PARTIAL | ... |

## Visual Design
**Rating: X/5**
- Strengths: ...
- Issues: ...

## UX
**Rating: X/5**
- Strengths: ...
- Issues: ...

## Errors Found
| Type | Severity | Description |
|---|---|---|
| console/network/runtime | high/medium/low | ... |

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
- Check both light and dark mode if supported: `mcp__chrome-devtools__emulate colorScheme="dark"`
- Use `includePreservedMessages=true` on console messages to catch errors from previous navigations
- If the app has multiple windows, review each one via `list_pages` + `select_page`
