/// <reference lib="dom" />
import { ipcRenderer, webUtils } from "electron";
import { isBrowserFile } from "../shared/browser-files";

/** Give websites their normal upload handlers before opening an unhandled file drop. */
export function installFileDrop(): void {
  window.addEventListener(
    "dragover",
    (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    },
    false,
  );
  window.addEventListener(
    "drop",
    (event) => {
      if (!event.isTrusted) return;
      // Append the default action during capture, after the page's existing window
      // listeners. It still runs synchronously while Chromium can cancel navigation.
      const handle = (dropped: DragEvent) => {
        if (dropped !== event) return;
        window.removeEventListener("drop", handle);
        if (event.defaultPrevented) return;
        if (
          event
            .composedPath()
            .some((node) => node instanceof HTMLInputElement && node.type === "file")
        )
          return;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return;
        event.preventDefault();
        const paths = files.map((file) => webUtils.getPathForFile(file)).filter(isBrowserFile);
        if (paths.length) ipcRenderer.send("files:dropped", paths);
      };
      window.addEventListener("drop", handle);
      // A website may stop propagation before the event returns to window.
      setTimeout(() => window.removeEventListener("drop", handle), 0);
    },
    { capture: true },
  );
}
