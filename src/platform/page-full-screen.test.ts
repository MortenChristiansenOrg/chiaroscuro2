import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FullScreenView, type FullScreenWindow, PageFullScreen } from "./page-full-screen";

const frame = { x: 300, y: 50, width: 800, height: 600 };
const screenArea = { x: 0, y: 0, width: 1920, height: 1080 };

function makeView(bounds = frame) {
  return {
    bounds,
    radius: 8,
    getBounds() {
      return this.bounds;
    },
    setBounds(next: typeof frame) {
      this.bounds = next;
    },
    setBorderRadius(radius: number) {
      this.radius = radius;
    },
  } satisfies FullScreenView & { bounds: typeof frame; radius: number };
}

function makeWindow() {
  const listeners = new Set<() => void>();
  const win = {
    content: screenArea as typeof frame,
    setFullScreen: vi.fn<(fullScreen: boolean) => void>(),
    getContentBounds: () => win.content,
    on: (_event: string, listener: () => void) => listeners.add(listener),
    removeListener: (_event: string, listener: () => void) => listeners.delete(listener),
    resize(content: typeof frame) {
      win.content = content;
      for (const listener of listeners) listener();
    },
    listeners,
  };
  return win satisfies FullScreenWindow;
}

describe("PageFullScreen", () => {
  let win: ReturnType<typeof makeWindow>;
  let restored: ReturnType<typeof vi.fn<() => void>>;
  let full: PageFullScreen<ReturnType<typeof makeView>>;
  let view: ReturnType<typeof makeView>;
  const exitPage = vi.fn();

  beforeEach(() => {
    exitPage.mockClear();
    win = makeWindow();
    restored = vi.fn<() => void>();
    full = new PageFullScreen(() => win, restored);
    view = makeView();
  });

  it("fills the window without rounded corners and follows its size", () => {
    full.enter(view, { exitPage });
    expect(view.bounds).toEqual(screenArea);
    expect(view.radius).toBe(0);
    win.resize({ x: 0, y: 0, width: 2560, height: 1440 });
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });

  it("returns the view when the page leaves, and stops following the window", () => {
    full.enter(view, { exitPage });
    full.left(view);
    expect(view.bounds).toEqual(frame);
    expect(view.radius).toBe(8);
    expect(win.listeners.size).toBe(0);
    expect(restored).toHaveBeenCalledOnce();
    expect(exitPage).not.toHaveBeenCalled();
  });

  it("applies bounds and radius that changed during full screen on leaving", () => {
    const later = { x: 10, y: 20, width: 30, height: 40 };
    full.enter(view, { exitPage });
    expect(full.holdBounds(view, later)).toBe(true);
    full.setBorderRadius(view, 0);
    expect(view.bounds).toEqual(screenArea);
    full.setBorderRadius(view, 4);
    expect(view.radius).toBe(0);
    full.left(view);
    expect(view.bounds).toEqual(later);
    expect(view.radius).toBe(4);
  });

  it("refits when bounds arrive after the window reached its size without an event", () => {
    full.enter(view, { exitPage });
    win.content = { x: 0, y: 0, width: 2560, height: 1440 };
    full.holdBounds(view, frame);
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
  });

  it("does not hold bounds for other views", () => {
    full.enter(view, { exitPage });
    expect(full.holdBounds(makeView(), frame)).toBe(false);
  });

  it("makes the browser window full screen for a page in the sub-tab window", () => {
    const overlay = { setBounds: vi.fn() };
    full.enter(view, { overlay, exitPage });
    expect(full.coversOverlay).toBe(true);
    expect(win.setFullScreen).toHaveBeenCalledWith(true);
    expect(overlay.setBounds).toHaveBeenLastCalledWith(screenArea);
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    full.left(view);
    expect(full.coversOverlay).toBe(false);
    expect(win.setFullScreen).toHaveBeenLastCalledWith(false);
    expect(view.bounds).toEqual(frame);
  });

  it("positions the view inside the sub-tab window, not by window coordinates", () => {
    const overlay = { setBounds: vi.fn() };
    win.content = { x: 1920, y: 0, width: 1920, height: 1080 };
    full.enter(view, { overlay, exitPage });
    expect(overlay.setBounds).toHaveBeenLastCalledWith(win.content);
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("exit leaves window and page full screen", () => {
    full.enter(view, { exitPage });
    full.exit(view);
    expect(view.bounds).toEqual(frame);
    expect(win.setFullScreen).toHaveBeenLastCalledWith(false);
    expect(exitPage).toHaveBeenCalledOnce();
  });

  it("exit ignores other views and an idle state", () => {
    full.exit();
    full.enter(view, { exitPage });
    full.exit(makeView());
    expect(exitPage).not.toHaveBeenCalled();
    expect(view.bounds).toEqual(screenArea);
  });

  it("a page that later reports leaving does nothing more", () => {
    full.enter(view, { exitPage });
    full.exit();
    win.setFullScreen.mockClear();
    full.left(view);
    expect(restored).toHaveBeenCalledOnce();
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });

  it("a closed view returns the window without asking the page", () => {
    full.enter(view, { exitPage });
    full.closed(view);
    expect(win.setFullScreen).toHaveBeenLastCalledWith(false);
    expect(exitPage).not.toHaveBeenCalled();
  });

  it("keeps the window full screen when a main page takes over from a sub-tab", () => {
    const overlay = { setBounds: vi.fn() };
    full.enter(view, { overlay, exitPage });
    win.setFullScreen.mockClear();
    const other = makeView();
    full.enter(other, { exitPage });
    expect(win.setFullScreen).not.toHaveBeenCalledWith(false);
    expect(full.coversOverlay).toBe(false);
    expect(other.bounds).toEqual(screenArea);
  });

  it("a second page takes over from the first", () => {
    const other = makeView({ x: 1, y: 2, width: 3, height: 4 });
    full.enter(view, { exitPage });
    full.enter(other, { exitPage });
    expect(view.bounds).toEqual(frame);
    expect(other.bounds).toEqual(screenArea);
    expect(win.listeners.size).toBe(1);
  });
});
