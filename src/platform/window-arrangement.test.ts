import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  arrangementOf,
  defaultRestoreBounds,
  nextArea,
  type Rect,
  WindowArranger,
  type WindowKey,
  windowKeyAction,
} from "./window-arrangement";

/** The work area of a 1920×1080 display with its taskbar at the bottom. */
const area: Rect = { x: 0, y: 0, width: 1920, height: 1032 };
const restored: Rect = { x: 100, y: 100, width: 1200, height: 800 };
const left: Rect = { x: 0, y: 0, width: 960, height: 1032 };
const right: Rect = { x: 960, y: 0, width: 960, height: 1032 };
const topLeft: Rect = { x: 0, y: 0, width: 960, height: 516 };
const topRight: Rect = { x: 960, y: 0, width: 960, height: 516 };
const bottomLeft: Rect = { x: 0, y: 516, width: 960, height: 516 };
const bottomRight: Rect = { x: 960, y: 516, width: 960, height: 516 };
const stretched: Rect = { x: 100, y: 0, width: 1200, height: 1032 };

const action = (key: WindowKey, bounds: Rect, maximized = false, areas = [area]) =>
  windowKeyAction(key, { bounds, maximized, area, areas });
const to = (bounds: Rect) => ({ type: "bounds", bounds });

describe("arrangementOf", () => {
  it("recognizes the bounds Windows gives a snapped window", () => {
    // Recorded on Windows 11 with the browser window: Windows leaves a pixel at some edges.
    expect(arrangementOf({ x: 1, y: 0, width: 958, height: 1031 }, area, false)).toEqual({
      kind: "half",
      side: "left",
    });
    expect(arrangementOf({ x: 961, y: 516, width: 958, height: 515 }, area, false)).toEqual({
      kind: "quarter",
      side: "right",
      top: false,
    });
    expect(arrangementOf({ x: 100, y: 0, width: 1200, height: 1031 }, area, false)).toEqual({
      kind: "stretched",
    });
  });

  it("treats other bounds as restored, and a maximized window as maximized", () => {
    expect(arrangementOf(restored, area, false)).toEqual({ kind: "restored" });
    expect(arrangementOf({ ...topLeft, width: 900 }, area, false)).toEqual({ kind: "restored" });
    expect(arrangementOf({ x: -8, y: -8, width: 1936, height: 1048 }, area, true)).toEqual({
      kind: "maximized",
    });
  });
});

// Each expectation was observed with Windows 11's window keys on the browser window (#134).
describe("Windows 11's window keys on one display", () => {
  it("Win+Left and Win+Right snap a window to that side, wrap around, and restore it", () => {
    expect(action("left", restored)).toEqual(to(left));
    expect(action("left", left)).toEqual(to(right));
    expect(action("left", right)).toEqual({ type: "restore" });
    expect(action("right", restored)).toEqual(to(right));
    expect(action("right", right)).toEqual(to(left));
    expect(action("right", left)).toEqual({ type: "restore" });
    expect(action("left", area, true)).toEqual(to(left));
    expect(action("left", stretched)).toEqual(to(left));
  });

  it("Win+Left and Win+Right move a quarter-snapped window to the quarter beside it", () => {
    expect(action("left", topRight)).toEqual(to(topLeft));
    expect(action("left", topLeft)).toEqual(to(topRight));
    expect(action("right", topLeft)).toEqual(to(topRight));
    expect(action("right", bottomRight)).toEqual(to(bottomLeft));
    expect(action("left", bottomLeft)).toEqual(to(bottomRight));
  });

  it("Win+Up and Win+Down move between halves and quarters, and maximize or minimize", () => {
    expect(action("up", restored)).toEqual({ type: "maximize", area });
    expect(action("up", area, true)).toEqual({ type: "none" });
    expect(action("up", left)).toEqual(to(topLeft));
    expect(action("up", topRight)).toEqual({ type: "maximize", area });
    expect(action("up", bottomRight)).toEqual(to(right));
    expect(action("down", area, true)).toEqual({ type: "restore" });
    expect(action("down", restored)).toEqual({ type: "minimize" });
    expect(action("down", left)).toEqual(to(bottomLeft));
    expect(action("down", topLeft)).toEqual(to(left));
    expect(action("down", bottomLeft)).toEqual({ type: "minimize" });
    expect(action("down", stretched)).toEqual({ type: "restore" });
  });

  it("Win+Shift+Up stretches a window to the work area's height", () => {
    expect(action("shift+up", restored)).toEqual(to(stretched));
    expect(action("shift+up", stretched)).toEqual({ type: "none" });
    expect(action("shift+up", right)).toEqual({ type: "none" });
    expect(action("shift+up", bottomLeft)).toEqual(to(left));
    expect(action("shift+up", topRight)).toEqual(to(right));
  });

  it("Win+Shift+Left and Win+Shift+Right do nothing", () => {
    expect(action("shift+left", restored)).toEqual({ type: "none" });
    expect(action("shift+right", left)).toEqual({ type: "none" });
  });
});

describe("window keys with more displays", () => {
  /** A second display to the right, at a different size. */
  const second: Rect = { x: 1920, y: 0, width: 2560, height: 1392 };
  const third: Rect = { x: -1280, y: 0, width: 1280, height: 984 };
  const areas = [area, second, third];

  it("finds the display beside one, and wraps around past the last", () => {
    expect(nextArea(areas, area, "right")).toBe(second);
    expect(nextArea(areas, area, "left")).toBe(third);
    expect(nextArea(areas, second, "right")).toBe(third);
    expect(nextArea(areas, third, "left")).toBe(second);
    expect(nextArea([area], area, "left")).toBe(area);
  });

  it("Win+Left on a window snapped left snaps it right on the display to the left", () => {
    expect(action("left", left, false, areas)).toEqual(
      to({ x: -640, y: 0, width: 640, height: 984 }),
    );
    expect(action("right", right, false, areas)).toEqual(
      to({ x: 1920, y: 0, width: 1280, height: 1392 }),
    );
    expect(action("right", topRight, false, areas)).toEqual(
      to({ x: 1920, y: 0, width: 1280, height: 696 }),
    );
  });

  it("Win+Shift+Right moves a window to the same place on the next display", () => {
    expect(action("shift+right", restored, false, areas)).toEqual(
      to({ x: 1920 + 133, y: 135, width: 1200, height: 800 }),
    );
    expect(action("shift+right", area, true, areas)).toEqual({ type: "maximize", area: second });
    expect(action("shift+right", left, false, areas)).toEqual(
      to({ x: 1920, y: 0, width: 1280, height: 1392 }),
    );
    expect(action("shift+left", stretched, false, areas)).toEqual(
      to({ x: -1280 + 67, y: 0, width: 1200, height: 984 }),
    );
  });

  it("keeps a moved window inside the smaller display", () => {
    const wide = { x: 600, y: 100, width: 1300, height: 900 };
    expect(action("shift+left", wide, false, areas)).toEqual(
      to({ x: -1280, y: 84, width: 1280, height: 900 }),
    );
  });
});

class FakeWindow extends EventEmitter {
  bounds: Rect = restored;
  normal: Rect = restored;
  maximized = false;
  minimized = false;
  getBounds = () => (this.maximized ? { x: -8, y: -8, width: 1936, height: 1048 } : this.bounds);
  getNormalBounds = () => this.normal;
  isMaximized = () => this.maximized;
  isMinimized = () => this.minimized;
  isFullScreen = () => false;
  setBounds(bounds: Rect) {
    this.bounds = this.normal = bounds;
    this.emit("resize");
  }
  maximize() {
    this.maximized = true;
    this.emit("resize");
  }
  unmaximize() {
    this.maximized = false;
    this.bounds = this.normal;
    this.emit("resize");
  }
  minimize() {
    this.minimized = true;
  }
  /** The user moves or resizes the window. */
  drag(bounds: Rect) {
    this.setBounds(bounds);
  }
}

const screen = {
  getDisplayMatching: () => ({ workArea: area }),
  getAllDisplays: () => [{ workArea: area }],
};

describe("WindowArranger", () => {
  it("returns a snapped window to the bounds it had before", () => {
    const win = new FakeWindow();
    const arranger = new WindowArranger(win, screen);
    arranger.press("left");
    expect(win.bounds).toEqual(left);
    arranger.press("up");
    expect(win.bounds).toEqual(topLeft);
    arranger.press("right");
    expect(win.bounds).toEqual(topRight);
    // Maximized from a quarter, then restored: back to the bounds from before the snap.
    arranger.press("up");
    expect(win.maximized).toBe(true);
    expect(arranger.press("down")).toBe("restore");
    expect(win.maximized).toBe(false);
    expect(win.bounds).toEqual(restored);
  });

  it("follows the bounds the user gives the window", () => {
    const win = new FakeWindow();
    const arranger = new WindowArranger(win, screen);
    const moved = { x: 300, y: 200, width: 900, height: 700 };
    win.drag(moved);
    arranger.press("shift+up");
    expect(win.bounds).toEqual({ ...moved, y: 0, height: 1032 });
    arranger.press("down");
    expect(win.bounds).toEqual(moved);
  });

  it("returns a window that was snapped before it was followed to default bounds", () => {
    const win = new FakeWindow();
    win.bounds = win.normal = right;
    const arranger = new WindowArranger(win, screen);
    arranger.press("left");
    expect(win.bounds).toEqual(defaultRestoreBounds(area));
  });

  it("snaps a maximized window, and restores it to its bounds from before", () => {
    const win = new FakeWindow();
    const arranger = new WindowArranger(win, screen);
    win.maximize();
    arranger.press("right");
    expect(win.maximized).toBe(false);
    expect(win.bounds).toEqual(right);
    arranger.press("left");
    expect(win.bounds).toEqual(restored);
  });

  it("minimizes, and ignores keys while minimized", () => {
    const win = new FakeWindow();
    const arranger = new WindowArranger(win, screen);
    expect(arranger.press("down")).toBe("minimize");
    expect(win.minimized).toBe(true);
    expect(arranger.press("left")).toBe("none");
    expect(win.bounds).toEqual(restored);
  });
});
