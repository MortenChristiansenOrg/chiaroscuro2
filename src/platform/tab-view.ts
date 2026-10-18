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

const closing = new WeakMap<Electron.WebContents, Promise<void>>();

/**
 * Resolve on native destruction. A page that prevents beforeunload is closed only if
 * `confirmLeave` agrees; otherwise it is retained and the close rejects. Overlapping
 * requests share one close and one answer, so a later Stay cannot be overridden.
 */
export function closeTabContents(
  contents: Electron.WebContents,
  confirmLeave: () => boolean,
): Promise<void> {
  if (contents.isDestroyed()) return Promise.resolve();
  const pending = closing.get(contents);
  if (pending) return pending;
  const result = requestClose(contents, confirmLeave).finally(() => closing.delete(contents));
  closing.set(contents, result);
  return result;
}

function requestClose(contents: Electron.WebContents, confirmLeave: () => boolean) {
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
      reject(new Error("Page prevented closing"));
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

/**
 * Electron settles insertCSS and removeInsertedCSS when the renderer replies. A call that
 * reaches a document as a navigation commits never settles, so reject when the main frame
 * commits a page or an error page, crashes or closes. CSS belongs to a document; callers
 * apply it again to the new one. `discardLate` undoes a result that arrives after that.
 */
export function untilDocumentReplaced<T>(
  contents: Electron.WebContents,
  operation: () => Promise<T>,
  discardLate?: (value: T) => void,
): Promise<T> {
  if (contents.isDestroyed()) return Promise.reject(new Error("The page was closed"));
  const emitter: NodeJS.EventEmitter = contents;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      settled = true;
      emitter.removeListener("did-navigate", onReplaced);
      emitter.removeListener("did-fail-load", onFailedLoad);
      emitter.removeListener("render-process-gone", onReplaced);
      emitter.removeListener("destroyed", onReplaced);
      complete();
    };
    const onReplaced = () =>
      finish(() => reject(new Error("The page changed before its CSS was updated")));
    // Error pages commit without did-navigate. A failure that keeps the old page still
    // rejects; `discardLate` removes the style its late answer applied.
    const onFailedLoad = (...args: unknown[]) => {
      if (args[4] === true) onReplaced();
    };
    emitter.on("did-navigate", onReplaced);
    emitter.on("did-fail-load", onFailedLoad);
    emitter.on("render-process-gone", onReplaced);
    emitter.on("destroyed", onReplaced);
    try {
      operation().then(
        (value) => {
          if (settled) discardLate?.(value);
          else finish(() => resolve(value));
        },
        (error: unknown) => {
          if (!settled) finish(() => reject(error));
        },
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
