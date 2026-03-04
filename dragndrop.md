# Drag-and-Drop: Debug Log

## Problem

Native OS file drag-and-drop from Windows Explorer does not work in the Electron app. No drag events reach the renderer, and no navigation events fire in main process.

## What's Been Tried

### 1. DOM drag events in renderer (`drag-drop.renderer.tsx`)
- Added `document.addEventListener` for `dragenter`, `dragover`, `dragleave`, `drop`
- **Result**: Events never fire. Console shows "listeners attached" but no drag events logged.

### 2. `will-navigate` interception in main process (`main/index.ts`)
- Added `app.on('web-contents-created')` handler that listens for `will-navigate` on all webContents
- Intercepts `file:///` URLs, converts with `fileURLToPath`, sends `DRAG_DROP_OPEN_FILES` command
- **Result**: Works for JS-initiated navigation (`window.location.href = "file:///..."`) but NOT for native OS file drops. The event simply never fires.

### 3. `navigateOnDragDrop: true` (`main/index.ts` + `platform/electron.ts`)
- Added `navigateOnDragDrop: true` to both BrowserWindow and WebContentsView webPreferences
- This Electron option (defaults to false) tells Chromium to allow file drops to trigger page navigation
- **Result**: Still doesn't work. No `will-navigate` or `did-start-navigation` events fire from native drops.

### 4. `file:` added to ALLOWED_SCHEMES (`platform/electron.ts`)
- Ensured `file:` protocol is in the allowed schemes set so navigation filtering doesn't block it
- **Result**: Necessary but not sufficient — the events never reach the filter.

## Root Cause Analysis

All three approaches fail because **drag events from the OS never reach Chromium's content layer**. The events are blocked before Chromium processes them.

### Suspected causes (from Electron GitHub issues research):

#### A. `backgroundMaterial: "acrylic"` + `titleBarStyle: "hidden"` (Most likely)
- `backgroundMaterial: "acrylic"` uses Windows DWM composition APIs that change how the window processes input
- Combined with `titleBarStyle: "hidden"`, this may prevent Windows from routing drag events to the window's client area
- No specific Electron issue documents this exact interaction, but multiple issues report `backgroundMaterial` problems with hidden title bars
- **Test**: Remove `backgroundMaterial: "acrylic"` and see if drops start working

#### B. `-webkit-app-region: drag` on TitleBar (Partial)
- The TitleBar component has `WebkitAppRegion: "drag"` which on Windows blocks ALL pointer events (including drag-drop) in that region
- This is a known Windows-only limitation (electron#29891, closed as wontfix)
- **BUT**: This only covers the narrow title bar strip. Tab bar, sidebar, and content area don't have `app-region: drag`, so drops on those areas should still work
- This explains why title bar drops fail, but not why ALL drops fail

#### C. Electron 28+ Chromium DnD regression (electron#42252)
- Chromium 119+ changed internal drag operation storage, breaking custom DnD
- When `preventDefault()` is called on drag events, Chromium calls `CompleteDragExit` which clears drag data
- Closed as stale without a fix
- **BUT**: This mainly affects JS-initiated custom drags, not OS file drops

#### D. UIPI / Admin privilege mismatch (electron#5243)
- If Electron runs elevated (admin) but Explorer doesn't, Windows blocks cross-process drag-drop
- Need to verify the app isn't running elevated

## Current Plan

### Step 1: Test without `backgroundMaterial: "acrylic"`
Remove acrylic, rebuild, test native file drop. This isolates whether DWM composition is the blocker.

### Step 2: If acrylic is the cause
Find a workaround to keep the visual effect while allowing drag-drop:
- Option A: Apply acrylic AFTER window creation (may not help)
- Option B: Use CSS `backdrop-filter: blur()` instead of native acrylic
- Option C: Temporarily disable acrylic during drag operations (if we can detect them)
- Option D: Accept the trade-off and drop acrylic

### Step 3: If acrylic is NOT the cause
- Check if running as admin (UIPI issue)
- Try a minimal Electron test app with same config to isolate
- Consider native Win32 IDropTarget approach (nuclear option, per Fileside blog)

## Current State

- Main branch merged into worktree (has dev-tools feature for console access)
- `backgroundMaterial: "acrylic"` is currently **enabled** (re-added during merge)
- `navigateOnDragDrop: true` is set on BrowserWindow
- `will-navigate` interception handler is in place
- App is running, awaiting user test with dev tools console open

## Files Modified

- `src/main/index.ts` — drag-drop imports, `navigateOnDragDrop: true`, `will-navigate` handler
- `src/features/drag-drop/drag-drop.main.ts` — `pathToFileURL` fix for Windows paths
- `src/features/drag-drop/drag-drop.renderer.tsx` — DOM drag event listeners + overlay UI
- `src/platform/electron.ts` — `file:` in ALLOWED_SCHEMES, `navigateOnDragDrop: true` on WebContentsView

## Relevant Electron Issues

- [#42252](https://github.com/electron/electron/issues/42252) — Custom DnD broken on Electron 28+
- [#29891](https://github.com/electron/electron/issues/29891) — app-region: drag blocks events on Windows (wontfix)
- [#32100](https://github.com/electron/electron/issues/32100) — DnD to BrowserWindow
- [#5243](https://github.com/electron/electron/issues/5243) — DnD fails when running as admin
- [#48031](https://github.com/electron/electron/issues/48031) — backgroundMaterial issues
- [Fileside blog](https://www.fileside.app/blog/2019-04-22_fixing-drag-and-drop/) — Native Win32 IDropTarget workaround
