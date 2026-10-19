import { type BrowserWindow, dialog } from "electron";

/** The user stayed on a page that warned about unsaved changes, so it was not closed. */
export class StayedOnPage extends Error {
  /** @param asked Whether the user was asked; false if the page was kept without asking. */
  constructor(readonly asked = true) {
    super("Page prevented closing");
    this.name = "StayedOnPage";
  }
}

/** The page a leave prompt asks about. */
export interface PageName {
  title: string;
  /** The page's address. Omitted for pages whose address means nothing to the user. */
  url?: string;
}

let askingMs = 0;
let showing = 0;
let showingSince = 0;

/**
 * Total time spent asking about pages: prompts shown and pages being shown before a prompt,
 * so waits can exclude time the user spends deciding.
 */
export function leavePromptTime(): number {
  return askingMs + (showing > 0 ? Date.now() - showingSince : 0);
}

/** Count the time a page is being shown before asking about it as time spent asking. */
export async function whileShowingPage<T>(show: () => Promise<T>): Promise<T> {
  if (showing++ === 0) showingSince = Date.now();
  try {
    return await show();
  } finally {
    if (--showing === 0) askingMs += Date.now() - showingSince;
  }
}

const MAX_ADDRESS_LENGTH = 100;

// Control and bidirectional formatting characters could add lines to the prompt or disguise
// the address, so they stay escaped, as Chrome shows them.
const UNSAFE_CHARACTERS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * A page's address as the prompt shows it: without `https://` or a user name and password,
 * readable, and shortened when long.
 */
export function pageAddress(url: string): string {
  let address = url;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
      address = parsed.href;
    }
  } catch {
    // Keep a malformed address as it is.
  }
  try {
    address = decodeURI(address).replace(UNSAFE_CHARACTERS, encodeURIComponent);
  } catch {
    // Keep a malformed escape as it is.
  }
  address = address.replace(/^https?:\/\//, "").replace(/^([^/?#]+)\/$/, "$1");
  return address.length > MAX_ADDRESS_LENGTH
    ? `${address.slice(0, MAX_ADDRESS_LENGTH - 1)}…`
    : address;
}

/**
 * Ask before leaving a page whose beforeunload handler vetoed closing it, as Chrome does.
 * Electron otherwise cancels the close silently. It must answer synchronously, inside
 * `will-prevent-unload`, so the prompt is a modal native dialog. It names the page by title
 * and address, since it may not be the page shown.
 */
export function confirmLeave(window: BrowserWindow | null | undefined, page: PageName): boolean {
  const leave = 0;
  const address = page.url ? pageAddress(page.url) : "";
  const title = (page.title || "").trim() || address;
  const name = [...new Set([title, address])].filter(Boolean).join("\n");
  const options: Electron.MessageBoxSyncOptions = {
    type: "question",
    title,
    message: "Leave this page?",
    detail: `${name ? `${name}\n\n` : ""}Changes you made may not be saved.`,
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
    // Time spent showing a page already counts while a prompt opens meanwhile.
    if (showing === 0) askingMs += Date.now() - start;
  }
}

const pageWindows = new Set<BrowserWindow>();
const pageNames = new WeakMap<BrowserWindow, () => PageName>();
const stayListeners = new WeakMap<BrowserWindow, Set<() => void>>();
const vetoAnswers = new WeakMap<BrowserWindow, () => boolean>();

/**
 * Ask "Leave this page?" when the page shown in its own window (a pop-up or an extension
 * window) vetoes closing it. The window is closed with the browser when it quits.
 */
export function askBeforeClosingWindow(window: BrowserWindow, name: () => PageName): void {
  pageWindows.add(window);
  pageNames.set(window, name);
  window.once("closed", () => pageWindows.delete(window));
  window.webContents.on("will-prevent-unload", (event) => {
    const answer = vetoAnswers.get(window) ?? (() => confirmLeaveWindow(window));
    if (answer()) {
      event.preventDefault();
      return;
    }
    for (const stayed of stayListeners.get(window) ?? []) stayed();
  });
}

/** Ask before leaving the page in a window registered with `askBeforeClosingWindow`. */
export function confirmLeaveWindow(window: BrowserWindow): boolean {
  return confirmLeave(window, pageNames.get(window)?.() ?? { title: window.getTitle() });
}

/** Windows that show a page and ask before closing it. */
export function windowsWithPages(): BrowserWindow[] {
  return [...pageWindows].filter((window) => !window.isDestroyed());
}

/**
 * Close a page window. Resolves once it closed; rejects with `StayedOnPage` if the user stays.
 * When the page warns about unsaved changes, `leave` answers in place of the prompt, for
 * example to leave a page that was too slow to ask before quitting was confirmed.
 */
export function closePageWindow(
  window: BrowserWindow,
  leave: () => boolean = () => confirmLeaveWindow(window),
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
      if (vetoAnswers.get(window) === leave) vetoAnswers.delete(window);
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
    vetoAnswers.set(window, leave);
    try {
      window.close();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
