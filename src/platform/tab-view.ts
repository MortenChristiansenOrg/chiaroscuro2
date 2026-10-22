import path from "node:path";
import { type WebContents, WebContentsView, type WebPreferences } from "electron";
import { StayedOnPage } from "./leave-prompt";

// Electron passes the renderer-created guest at runtime but omits it from its public type.
export type TabWindowOpenOptions = Electron.BrowserWindowConstructorOptions & {
  webContents?: WebContents;
};

const TAB_PRELOAD = path.join(__dirname, "../preload/tab.js");

/** The preferences clone() copies. Electron exposes this accessor but does not type it. */
function lastWebPreferences(contents: WebContents): WebPreferences | null {
  return (
    contents as WebContents & { getLastWebPreferences(): WebPreferences | null }
  ).getLastWebPreferences();
}

/** Construct normal and duplicated tabs without replacing a clone's session or preferences. */
export function createTabView(
  source?: WebContents,
  windowOpenOptions?: TabWindowOpenOptions,
): WebContentsView {
  const view = source
    ? new WebContentsView({
        webContents: source.clone(),
        // clone() copies preferences without the preload, which every tab needs (#51). Given
        // with webContents, these replace the clone's preferences, so pass all of them.
        webPreferences: { ...lastWebPreferences(source), preload: TAB_PRELOAD },
      })
    : new WebContentsView({
        ...(windowOpenOptions?.webContents && { webContents: windowOpenOptions.webContents }),
        webPreferences: {
          ...windowOpenOptions?.webPreferences,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          preload: TAB_PRELOAD,
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

const closingForUser = new WeakMap<Electron.WebContents, Promise<void>>();

/**
 * Close a tab the user closes, asking with `confirmLeave` if its page warns. If the close
 * joined one that found the page warns but kept it without asking, ask now and leave it on
 * Leave: its beforeunload may not warn a second time. Overlapping requests share one close
 * and one answer.
 */
export function closeTabContentsAsking(
  contents: Electron.WebContents,
  confirmLeave: () => boolean,
): Promise<void> {
  const pending = closingForUser.get(contents);
  if (pending) return pending;
  const result = closeAsking(contents, confirmLeave).finally(() => closingForUser.delete(contents));
  closingForUser.set(contents, result);
  return result;
}

async function closeAsking(contents: Electron.WebContents, confirmLeave: () => boolean) {
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
