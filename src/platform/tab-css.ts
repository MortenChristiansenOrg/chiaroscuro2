import { ipcMain } from "electron";
import { TAB_CSS_DONE, TAB_CSS_INSERT, TAB_CSS_REMOVE } from "../shared/tab-css";

/*
 * Tab CSS goes through the tab preload rather than webContents.insertCSS. Electron answers
 * insertCSS through a process-wide listener that it removes only when the renderer replies.
 * A call that reaches a page as a new document commits gets no reply, so that listener and
 * the WebContents it holds stay forever (#127). Here the request is a plain message, and its
 * answer is awaited through state that is weakly keyed by the WebContents and dropped as
 * soon as the call settles or its document is replaced.
 */

type Answer = (error?: string) => void;
const answers = new WeakMap<Electron.WebContents, Map<string, Answer>>();
let nextKey = 0;
let listening = false;

function onDone(event: Electron.IpcMainEvent, key: unknown, operation: unknown, error: unknown) {
  if (typeof key !== "string") return;
  const answer = answers.get(event.sender)?.get(key);
  if (answer) {
    answer(typeof error === "string" ? error : undefined);
    return;
  }
  // An insert answered after its call was abandoned may have reached the new document.
  // Its caller applies CSS to that document again, so remove the stray copy.
  if (operation === "insert" && error === undefined && !event.sender.isDestroyed())
    event.sender.send(TAB_CSS_REMOVE, key);
}

function request(
  contents: Electron.WebContents,
  channel: string,
  key: string,
  ...args: unknown[]
): Promise<void> {
  if (!listening) {
    ipcMain.on(TAB_CSS_DONE, onDone);
    listening = true;
  }
  return untilDocumentReplaced(
    contents,
    () =>
      new Promise<void>((resolve, reject) => {
        let pending = answers.get(contents);
        if (!pending) {
          pending = new Map();
          answers.set(contents, pending);
        }
        pending.set(key, (error) => (error === undefined ? resolve() : reject(new Error(error))));
        contents.send(channel, key, ...args);
      }),
  ).finally(() => answers.get(contents)?.delete(key));
}

/** Add a style sheet to the tab's current document and return the key that removes it. */
export async function insertTabCss(contents: Electron.WebContents, css: string): Promise<string> {
  const key = `tab-css-${++nextKey}`;
  await request(contents, TAB_CSS_INSERT, key, css);
  return key;
}

/** Remove a style sheet. Keys of earlier documents are ignored; their styles went with them. */
export function removeTabCss(contents: Electron.WebContents, key: string): Promise<void> {
  return request(contents, TAB_CSS_REMOVE, key);
}

/**
 * A call that reaches a document as a navigation commits is never answered, so reject when
 * the main frame commits a page or an error page, crashes or closes. CSS belongs to a
 * document; callers apply it again to the new one.
 */
function untilDocumentReplaced(
  contents: Electron.WebContents,
  operation: () => Promise<void>,
): Promise<void> {
  if (contents.isDestroyed()) return Promise.reject(new Error("The page was closed"));
  const emitter: NodeJS.EventEmitter = contents;
  return new Promise<void>((resolve, reject) => {
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
    // Error pages commit without did-navigate, and did-fail-load does not say whether the
    // failure kept the old page. Reject either way: a late insert answer removes its style,
    // and the did-stop-loading that follows every failure makes callers apply again.
    const onFailedLoad = (...args: unknown[]) => {
      if (args[4] === true) onReplaced();
    };
    emitter.on("did-navigate", onReplaced);
    emitter.on("did-fail-load", onFailedLoad);
    emitter.on("render-process-gone", onReplaced);
    emitter.on("destroyed", onReplaced);
    operation().then(
      () => {
        if (!settled) finish(resolve);
      },
      (error: unknown) => {
        if (!settled) finish(() => reject(error));
      },
    );
  });
}
