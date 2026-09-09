import path from "node:path";
import { type WebContents, WebContentsView } from "electron";

/** Construct normal and duplicated tabs without replacing a clone's session or preferences. */
export function createTabView(source?: WebContents): WebContentsView {
  const view = source
    ? new WebContentsView({ webContents: source.clone() })
    : new WebContentsView({
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          preload: path.join(__dirname, "../preload/tab.js"),
        },
      });
  // Isolate zoom without partitioning the session's cookies or storage.
  view.webContents.setZoomMode("isolated");
  if (source) {
    const zoomLevel = source.getZoomLevel();
    // First renderer initialization resets isolated zoom. Restore before feature listeners
    // publish did-finish-load, then allow each copy to zoom independently.
    view.webContents.once("did-finish-load", () => view.webContents.setZoomLevel(zoomLevel));
  }
  return view;
}
