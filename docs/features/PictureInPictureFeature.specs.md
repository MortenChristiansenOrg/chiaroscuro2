# Specification for Picture-in-Picture Feature

## Overview

Automatically continues video playback in a small floating always-on-top window when the user switches away from a tab that is playing a video. The player appears in the lower-right corner of the desktop, independent of the browser window, providing uninterrupted video watching while using any application.

## Terminology

- **PiP**: Picture-in-Picture — a small always-on-top desktop window that continues playing a video from a background tab.
- **Source tab**: The tab whose video is displayed in the PiP player.
- **PiP window**: The frameless, always-on-top BrowserWindow in the bottom-right corner of the screen.

## Requirements

- When the user switches away from a tab that has a playing `<video>` element, the tab's WebContentsView is moved from the main window into a separate PiP BrowserWindow.
- The PiP window is always-on-top over all desktop windows, frameless, and positioned at the bottom-right corner of the primary display.
- The PiP window is approximately 400×225px (16:9 aspect ratio) with rounded corners and an elevated shadow.
- Video playback continues seamlessly — no interruption or reload.
- When the source tab is reactivated, the PiP window closes and the WCV moves back to the main window.
- Only one PiP player can be active at a time.
- Hovering over the PiP window reveals overlay controls with a fade-in animation:
  - A **play/pause** button centered in the player.
  - A **return-to-tab** button in the top-left corner.
  - A **close (X)** button in the top-right corner.
- Clicking the close button pauses the video and dismisses the PiP window.
- Clicking the return-to-tab button activates the source tab (dismissing PiP).
- If the source tab is closed, the PiP window closes immediately.
- Video detection uses `executeJavaScript` to check for a `<video>` element that is currently playing (`!paused && readyState >= 2`).

## Workflows

### Automatic PiP Activation

1. User is watching a video on a tab (e.g., YouTube).
2. User switches to another tab (clicks sidebar, Ctrl+Tab, etc.).
3. Main process detects a playing video in the previous tab via `executeJavaScript`.
4. The previous tab's WCV is moved from the main window into the PiP BrowserWindow.
5. The PiP window appears at the bottom-right corner of the screen, always-on-top.
6. The PiP window's HTML overlay is invisible until hovered.

### Hovering Over PiP

1. User moves mouse over the PiP window.
2. A semi-transparent dark scrim fades in over the video.
3. Play/pause, return-to-tab, and close buttons fade in.
4. User moves mouse away — controls fade out.

### Closing PiP

1. User clicks the X button on the PiP overlay.
2. Main process pauses the video via `executeJavaScript`.
3. The WCV is moved back to the main window and hidden.
4. The PiP window is hidden.

### Returning to Source Tab

1. User clicks the return-to-tab button.
2. The source tab is activated via `tabs:activate`.
3. PiP is dismissed as part of the normal tab activation flow (WCV moved back, PiP window hidden).

## Interactions

### Mouse interactions

- **Hover on PiP window**: Reveals overlay controls with fade animation.
- **Click play/pause**: Toggles video playback.
- **Click close (X)**: Pauses video and dismisses PiP.
- **Click return-to-tab**: Activates the source tab.

### Cross-feature interactions

- **Tabs**: Listens to `tabs:activated` to trigger PiP on tab switch. Listens to `tabs:closed` to dismiss PiP if source tab is closed.
- **Platform**: New platform methods for PiP window lifecycle (create, show, hide, attach/detach WCV).

## Commands & Events

### Commands

- `pip:close` — Close the PiP player and pause the video. Payload: `undefined`.
- `pip:toggle-play` — Toggle play/pause on the PiP video. Payload: `undefined`.
- `pip:return-to-tab` — Activate the source tab, dismissing PiP. Payload: `undefined`.

### Events

- `pip:activated` — PiP entered for a tab. Payload: `{ tabId: TabId }`.
- `pip:deactivated` — PiP dismissed. Payload: `undefined`.
- `pip:play-state-changed` — Video play state changed. Payload: `{ playing: boolean }`.

## Unresolved Issues

- Cross-origin iframes: Video detection via `executeJavaScript` cannot reach into cross-origin iframes. Some embedded players (not YouTube's main page, but embedded YouTube on other sites) may not be detectable. This is acceptable as a known limitation.
- DRM-protected content: Some DRM video players may not expose standard `<video>` elements. This is acceptable.
