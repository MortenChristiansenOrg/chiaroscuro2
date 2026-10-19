import path from "node:path";
import { type WebContents, WebContentsView } from "electron";
import { StayedOnPage } from "./leave-prompt";

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

const closing = new WeakMap<Electron.WebContents, Promise<void>>();

/**
 * Resolve on native destruction. A page that prevents beforeunload is closed only if
 * `confirmLeave` agrees; otherwise it is retained and the close rejects. Overlapping
 * requests share one close and one answer, so a later Stay cannot be overridden. `asks` says
 * whether `confirmLeave` asks the user; quitting first checks pages without asking.
 */
export function closeTabContents(
  contents: Electron.WebContents,
  confirmLeave: () => boolean,
  { asks = true }: { asks?: boolean } = {},
): Promise<void> {
  if (contents.isDestroyed()) return Promise.resolve();
  const pending = closing.get(contents);
  if (pending) return pending;
  const result = requestClose(contents, confirmLeave, asks).finally(() => closing.delete(contents));
  closing.set(contents, result);
  return result;
}

/**
 * Close a tab the user closes, asking with `confirmLeave` if its page warns. If the close
 * joined one that found the page warns but kept it without asking, ask now and leave it on
 * Leave: its beforeunload may not warn a second time.
 */
export async function closeTabContentsAsking(
  contents: Electron.WebContents,
  confirmLeave: () => boolean,
): Promise<void> {
  try {
    await closeTabContents(contents, confirmLeave);
  } catch (error) {
    if (!(error instanceof StayedOnPage) || error.asked) throw error;
    if (contents.isDestroyed()) return;
    if (!confirmLeave()) throw new StayedOnPage();
    await closeTabContents(contents, () => true);
  }
}

function requestClose(contents: Electron.WebContents, confirmLeave: () => boolean, asks: boolean) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      contents.removeListener("destroyed", onDestroyed);
      contents.removeListener("will-prevent-unload", onPreventUnload);
    };
    const onDestroyed = () => {
      cleanup();
      resolve();
    };
    const onPreventUnload = (event: Electron.Event) => {
      // Preventing the veto lets the unload, and so the close, proceed.
      if (confirmLeave()) {
        event.preventDefault();
        return;
      }
      cleanup();
      reject(new StayedOnPage(asks));
    };
    contents.once("destroyed", onDestroyed);
    contents.on("will-prevent-unload", onPreventUnload);
    try {
      contents.close({ waitForBeforeUnload: true });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
