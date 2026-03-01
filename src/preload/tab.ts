/// <reference lib="dom" />
import { ipcRenderer, webFrame } from "electron";

const ZOOM_MIN = -3;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1;

// Capture Ctrl+wheel for zoom — the 'zoom-changed' webContents event
// doesn't fire reliably in WebContentsView, so we handle zoom directly
// via webFrame and notify the main process via IPC.
document.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    if (e.ctrlKey && e.deltaY !== 0) {
      e.preventDefault();
      const current = webFrame.getZoomLevel();
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
      );
      if (next !== current) {
        webFrame.setZoomLevel(next);
        ipcRenderer.send("tab:zoom-applied", next);
      }
    }
  },
  { passive: false, capture: true },
);
