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

import { closeTabContents, closeTabContentsAsking, createTabView } from "./tab-view";

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
  const stay = () => false;
  function fixture() {
    return Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
    });
  }

  it("waits for destruction after the synchronous close call", async () => {
    const contents = fixture();
    const done = vi.fn();
    const result = closeTabContents(contents as unknown as Electron.WebContents, stay).then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    contents.emit("destroyed");
    await result;
    expect(done).toHaveBeenCalledOnce();
    expect(contents.eventNames()).toEqual([]);
  });

  it("rejects a prevented unload the user stays on and removes its temporary listeners", async () => {
    const contents = fixture();
    const confirm = vi.fn(stay);
    const result = closeTabContents(contents as unknown as Electron.WebContents, confirm);
    const event = { preventDefault: vi.fn() };
    contents.emit("will-prevent-unload", event);
    await expect(result).rejects.toThrow("Page prevented closing");
    expect(confirm).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(contents.eventNames()).toEqual([]);
  });

  it("overrides a prevented unload the user leaves and waits for destruction", async () => {
    const contents = fixture();
    const done = vi.fn();
    const result = closeTabContents(contents as unknown as Electron.WebContents, () => true).then(
      done,
    );
    const event = { preventDefault: vi.fn() };
    contents.emit("will-prevent-unload", event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    contents.emit("destroyed");
    await result;
    expect(done).toHaveBeenCalledOnce();
    expect(contents.eventNames()).toEqual([]);
  });

  it("shares one close and one answer between overlapping requests", async () => {
    const contents = fixture();
    const confirm = vi.fn(stay);
    const first = closeTabContents(contents as unknown as Electron.WebContents, () => true);
    const second = closeTabContents(contents as unknown as Electron.WebContents, confirm);
    expect(second).toBe(first);
    expect(contents.close).toHaveBeenCalledOnce();
    const event = { preventDefault: vi.fn() };
    contents.emit("will-prevent-unload", event);
    expect(confirm).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    contents.emit("destroyed");
    await Promise.all([first, second]);
  });

  it("asks again for a later close after the user stayed", async () => {
    const contents = fixture();
    const first = closeTabContents(contents as unknown as Electron.WebContents, stay);
    contents.emit("will-prevent-unload", { preventDefault: vi.fn() });
    await expect(first).rejects.toThrow("Page prevented closing");
    const second = closeTabContents(contents as unknown as Electron.WebContents, () => true);
    expect(second).not.toBe(first);
    expect(contents.close).toHaveBeenCalledTimes(2);
    contents.emit("will-prevent-unload", { preventDefault: vi.fn() });
    contents.emit("destroyed");
    await second;
  });

  it("rejects a synchronous close failure without retaining listeners", async () => {
    const contents = fixture();
    contents.close.mockImplementation(() => {
      throw new Error("native close failed");
    });
    await expect(
      closeTabContents(contents as unknown as Electron.WebContents, stay),
    ).rejects.toThrow("native close failed");
    expect(contents.eventNames()).toEqual([]);
  });

  it("does not close already destroyed contents again", async () => {
    const contents = fixture();
    contents.isDestroyed.mockReturnValue(true);
    await closeTabContents(contents as unknown as Electron.WebContents, stay);
    expect(contents.close).not.toHaveBeenCalled();
  });
});

describe("closing a tab the user closes", () => {
  function fixture() {
    return Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
    }) as unknown as Electron.WebContents & EventEmitter & { close: ReturnType<typeof vi.fn> };
  }

  it("asks when it joined a close that kept the page without asking", async () => {
    const contents = fixture();
    // Quitting checks whether the page warns, keeping it without asking.
    const probe = closeTabContents(contents, () => false).catch(() => {});
    const ask = vi.fn(() => true);
    const closing = closeTabContentsAsking(contents, ask);
    contents.emit("will-prevent-unload", { preventDefault: vi.fn() });
    await probe;
    await vi.waitFor(() => expect(contents.close).toHaveBeenCalledTimes(2));
    contents.emit("will-prevent-unload", { preventDefault: vi.fn() });
    contents.emit("destroyed");
    await closing;
    expect(ask).toHaveBeenCalledOnce();
  });

  it("does not ask again after the user stayed", async () => {
    const contents = fixture();
    const ask = vi.fn(() => false);
    const closing = closeTabContentsAsking(contents, ask);
    contents.emit("will-prevent-unload", { preventDefault: vi.fn() });
    await expect(closing).rejects.toThrow("Page prevented closing");
    expect(ask).toHaveBeenCalledOnce();
    expect(contents.close).toHaveBeenCalledOnce();
  });
});
