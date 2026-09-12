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
    const contents = view.webContents;
    const restoreZoom = () => contents.setZoomLevel(zoomLevel);
    const failed = (
      _event: Electron.Event,
      _code: number,
      _description: string,
      _url: string,
      isMainFrame: boolean,
    ) => {
      if (isMainFrame) restoreZoom();
    };
    contents.on("did-finish-load", restoreZoom);
    contents.on("did-fail-load", failed);
    contents.once("did-stop-loading", () => {
      contents.removeListener("did-finish-load", restoreZoom);
      contents.removeListener("did-fail-load", failed);
    });
  }
  return view;
}

/** Resolve on native destruction, retaining a page that prevents beforeunload. */
export function closeTabContents(contents: Electron.WebContents): Promise<void> {
  if (contents.isDestroyed()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      contents.removeListener("destroyed", onDestroyed);
      contents.removeListener("will-prevent-unload", onPreventUnload);
    };
    const onDestroyed = () => {
      cleanup();
      resolve();
    };
    const onPreventUnload = () => {
      cleanup();
      reject(new Error("Page prevented closing"));
    };
    contents.once("destroyed", onDestroyed);
    contents.once("will-prevent-unload", onPreventUnload);
    try {
      contents.close({ waitForBeforeUnload: true });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
