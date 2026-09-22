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
      if (!event.isTrusted || event.defaultPrevented) return;
      if (
        event
          .composedPath()
          .some((node) => node instanceof HTMLInputElement && node.type === "file")
      )
        return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length) return;
      // Never allow Chromium's default drop navigation to replace the shell or current tab.
      event.preventDefault();
      const paths = files.map((file) => webUtils.getPathForFile(file)).filter(isBrowserFile);
      if (paths.length) ipcRenderer.send("files:dropped", paths);
    },
    false,
  );
}
