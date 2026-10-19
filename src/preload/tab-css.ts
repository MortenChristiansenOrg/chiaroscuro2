import { ipcRenderer, webFrame } from "electron";
import {
  TAB_CSS_DONE,
  TAB_CSS_INSERT,
  TAB_CSS_REMOVE,
  type TabCssOperation,
} from "../shared/tab-css";

/**
 * Apply the main process's CSS to this document. Each document runs the preload afresh, so
 * its styles, and the keys that name them, end with it.
 */
export function installTabCss(): void {
  const styles = new Map<string, string>();
  const run = (key: unknown, operation: TabCssOperation, apply: (key: string) => void) => {
    if (typeof key !== "string") return;
    try {
      apply(key);
      ipcRenderer.send(TAB_CSS_DONE, key, operation);
    } catch (error) {
      ipcRenderer.send(TAB_CSS_DONE, key, operation, String(error));
    }
  };
  ipcRenderer.on(TAB_CSS_INSERT, (_event, key: unknown, css: unknown) =>
    run(key, "insert", (name) => {
      if (typeof css !== "string") throw new Error("CSS must be a string");
      styles.set(name, webFrame.insertCSS(css));
    }),
  );
  ipcRenderer.on(TAB_CSS_REMOVE, (_event, key: unknown) =>
    run(key, "remove", (name) => {
      const style = styles.get(name);
      styles.delete(name);
      // A key this document does not know named a style of a document that is gone.
      if (style !== undefined) webFrame.removeInsertedCSS(style);
    }),
  );
}
