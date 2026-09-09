import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  WebContentsView: class {
    webContents: unknown;
    constructor(options: { webContents: unknown }) {
      this.webContents = options.webContents;
    }
  },
}));

import { createTabView } from "./tab-view";

describe("cloned tab initialization", () => {
  it("restores zoom on main-frame failure and stops restoring after the initial load", () => {
    const contents = Object.assign(new EventEmitter(), {
      setZoomMode: vi.fn(),
      setZoomLevel: vi.fn(),
    });
    const source = {
      clone: () => contents,
      getZoomLevel: () => 2,
    } as unknown as Electron.WebContents;
    createTabView(source);
    contents.emit("did-fail-load", {}, -105, "Failed", "https://example.com/frame", false);
    expect(contents.setZoomLevel).not.toHaveBeenCalled();
    contents.emit("did-fail-load", {}, -105, "Failed", "https://example.com", true);
    expect(contents.setZoomLevel).toHaveBeenLastCalledWith(2);
    contents.emit("did-finish-load");
    contents.emit("did-stop-loading");
    contents.setZoomLevel.mockClear();
    contents.emit("did-fail-load", {}, -105, "Failed", "https://example.com", true);
    contents.emit("did-finish-load");
    expect(contents.setZoomLevel).not.toHaveBeenCalled();
  });
});
