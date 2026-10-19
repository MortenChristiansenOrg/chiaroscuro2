import { type BrowserWindow, dialog } from "electron";

/** The user stayed on a page that warned about unsaved changes, so it was not closed. */
export class StayedOnPage extends Error {
  constructor() {
    super("Page prevented closing");
    this.name = "StayedOnPage";
  }
}

let promptMs = 0;

/** Total time the leave prompt has been shown, so waits can exclude time the user spends deciding. */
export function leavePromptTime(): number {
  return promptMs;
}

/**
 * Ask before leaving a page whose beforeunload handler vetoed closing it, as Chrome does.
 * Electron otherwise cancels the close silently. It must answer synchronously, inside
 * `will-prevent-unload`, so the prompt is a modal native dialog.
 */
export function confirmLeave(window: BrowserWindow | null | undefined, title: string): boolean {
  const leave = 0;
  const options: Electron.MessageBoxSyncOptions = {
    type: "question",
    title,
    message: "Leave this page?",
    detail: "Changes you made may not be saved.",
    buttons: ["Leave", "Stay"],
    defaultId: leave,
    cancelId: 1,
    noLink: true,
  };
  const start = Date.now();
  try {
    const answer =
      window && !window.isDestroyed()
        ? dialog.showMessageBoxSync(window, options)
        : dialog.showMessageBoxSync(options);
    return answer === leave;
  } finally {
    promptMs += Date.now() - start;
  }
}

const pageWindows = new Set<BrowserWindow>();
const stayListeners = new WeakMap<BrowserWindow, Set<() => void>>();
const leaveWithoutAsking = new WeakMap<BrowserWindow, () => boolean>();

/**
 * Ask "Leave this page?" when the page shown in its own window (a pop-up or an extension
 * window) vetoes closing it. The window is closed with the browser when it quits.
 */
export function askBeforeClosingWindow(window: BrowserWindow, title: () => string): void {
  pageWindows.add(window);
  window.once("closed", () => pageWindows.delete(window));
  window.webContents.on("will-prevent-unload", (event) => {
    if (leaveWithoutAsking.get(window)?.() || confirmLeave(window, title())) {
      event.preventDefault();
      return;
    }
    for (const stayed of stayListeners.get(window) ?? []) stayed();
  });
}

/** Windows that show a page and ask before closing it. */
export function windowsWithPages(): BrowserWindow[] {
  return [...pageWindows].filter((window) => !window.isDestroyed());
}

/**
 * Close a page window. Resolves once it closed; rejects with `StayedOnPage` if the user stays.
 * While `leave` is true, the page is left without asking, for example when it was too slow to
 * ask before quitting was confirmed.
 */
export function closePageWindow(
  window: BrowserWindow,
  leave: () => boolean = () => false,
): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let listeners = stayListeners.get(window);
    if (!listeners) {
      listeners = new Set();
      stayListeners.set(window, listeners);
    }
    const cleanup = () => {
      window.removeListener("closed", onClosed);
      listeners.delete(onStayed);
      if (leaveWithoutAsking.get(window) === leave) leaveWithoutAsking.delete(window);
    };
    const onClosed = () => {
      cleanup();
      resolve();
    };
    const onStayed = () => {
      cleanup();
      reject(new StayedOnPage());
    };
    window.once("closed", onClosed);
    listeners.add(onStayed);
    leaveWithoutAsking.set(window, leave);
    try {
      window.close();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
