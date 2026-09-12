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

import { closeTabContents, createTabView } from "./tab-view";

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

describe("native tab close completion", () => {
  function fixture() {
    return Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
    });
  }

  it("waits for destruction after the synchronous close call", async () => {
    const contents = fixture();
    const done = vi.fn();
    const result = closeTabContents(contents as unknown as Electron.WebContents).then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    contents.emit("destroyed");
    await result;
    expect(done).toHaveBeenCalledOnce();
    expect(contents.eventNames()).toEqual([]);
  });

  it("rejects a prevented unload and removes its temporary listeners", async () => {
    const contents = fixture();
    const result = closeTabContents(contents as unknown as Electron.WebContents);
    contents.emit("will-prevent-unload");
    await expect(result).rejects.toThrow("Page prevented closing");
    expect(contents.eventNames()).toEqual([]);
  });

  it("rejects a synchronous close failure without retaining listeners", async () => {
    const contents = fixture();
    contents.close.mockImplementation(() => {
      throw new Error("native close failed");
    });
    await expect(closeTabContents(contents as unknown as Electron.WebContents)).rejects.toThrow(
      "native close failed",
    );
    expect(contents.eventNames()).toEqual([]);
  });

  it("does not close already destroyed contents again", async () => {
    const contents = fixture();
    contents.isDestroyed.mockReturnValue(true);
    await closeTabContents(contents as unknown as Electron.WebContents);
    expect(contents.close).not.toHaveBeenCalled();
  });
});
