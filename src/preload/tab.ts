/// <reference lib="dom" />
import { ipcRenderer, webFrame } from "electron";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../features/zoom/zoom.shared";

// Disable FedCM (Federated Credential Management) in the page context.
// Electron doesn't implement the FedCM account-chooser UI for WebContentsView,
// so the API hangs or fails silently. Removing it forces identity providers
// (Google, etc.) to fall back to popup-based OAuth which we handle properly.
webFrame.executeJavaScript(`
  if (navigator.credentials) {
    const origGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = function(options) {
      if (options && options.identity) {
        return Promise.reject(new DOMException("FedCM is not supported", "NotSupportedError"));
      }
      return origGet(options);
    };
  }
`);

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
