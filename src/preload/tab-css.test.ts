import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAB_CSS_DONE, TAB_CSS_INSERT, TAB_CSS_REMOVE } from "../shared/tab-css";

const { ipcRenderer, webFrame } = vi.hoisted(() => {
  const { EventEmitter } = require("node:events") as typeof import("node:events");
  let next = 0;
  return {
    ipcRenderer: Object.assign(new EventEmitter(), { send: vi.fn() }),
    webFrame: {
      insertCSS: vi.fn((_css: string) => `renderer-${++next}`),
      removeInsertedCSS: vi.fn(),
    },
  };
});
vi.mock("electron", () => ({ ipcRenderer, webFrame }));

import { installTabCss } from "./tab-css";

describe("tab preload CSS", () => {
  beforeEach(() => {
    ipcRenderer.removeAllListeners();
    vi.clearAllMocks();
    installTabCss();
  });

  it("inserts and removes styles by the main process's keys and answers each request", () => {
    ipcRenderer.emit(TAB_CSS_INSERT, {}, "main-1", "h1{color:red}");
    expect(webFrame.insertCSS).toHaveBeenCalledWith("h1{color:red}");
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(TAB_CSS_DONE, "main-1", "insert");
    const style = webFrame.insertCSS.mock.results[0]?.value;

    ipcRenderer.emit(TAB_CSS_REMOVE, {}, "main-1");
    expect(webFrame.removeInsertedCSS).toHaveBeenCalledWith(style);
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(TAB_CSS_DONE, "main-1", "remove");
  });

  it("answers removal of a key from an earlier document without touching styles", () => {
    ipcRenderer.emit(TAB_CSS_REMOVE, {}, "unknown");
    expect(webFrame.removeInsertedCSS).not.toHaveBeenCalled();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(TAB_CSS_DONE, "unknown", "remove");
  });

  it("reports renderer failures", () => {
    webFrame.insertCSS.mockImplementationOnce(() => {
      throw new Error("bad origin");
    });
    ipcRenderer.emit(TAB_CSS_INSERT, {}, "main-2", "h1{}");
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      TAB_CSS_DONE,
      "main-2",
      "insert",
      "Error: bad origin",
    );
  });
});
