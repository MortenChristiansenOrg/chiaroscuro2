import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOCUS_SETTLE_MS,
  isCloseWindowInput,
  routeShortcutsToFocus,
  shortcutWindow,
  windowArrowKey,
} from "./keyboard-routing";

const key = (overrides: Partial<Parameters<typeof isCloseWindowInput>[0]> = {}) => ({
  type: "keyDown",
  key: "w",
  code: "KeyW",
  control: true,
  meta: false,
  alt: false,
  ...overrides,
});

describe("shortcutWindow", () => {
  const browser = { name: "browser" };
  const subTab = { name: "sub-tab" };
  const palette = { name: "palette" };
  const popout = { name: "extension pop-out" };

  it("routes the browser window and the windows shown as part of it to the browser window", () => {
    expect(shortcutWindow(browser, browser, [subTab, palette])).toBe(browser);
    expect(shortcutWindow(subTab, browser, [subTab, palette])).toBe(browser);
    expect(shortcutWindow(palette, browser, [subTab, palette])).toBe(browser);
  });

  it("does not route other windows of the app, or no window, to the browser window", () => {
    expect(shortcutWindow(popout, browser, [subTab, palette])).toBeUndefined();
    expect(shortcutWindow(null, browser, [subTab, palette])).toBeUndefined();
    // Overlays that were not created yet do not make a missing window match.
    expect(shortcutWindow(undefined, browser, [undefined, null])).toBeUndefined();
  });

  it("routes nothing without a browser window", () => {
    expect(shortcutWindow(subTab, undefined, [subTab])).toBeUndefined();
  });
});

describe("isCloseWindowInput", () => {
  it("matches Ctrl+W and Ctrl+F4 outside macOS", () => {
    expect(isCloseWindowInput(key(), "win32")).toBe(true);
    expect(isCloseWindowInput(key({ shift: true }), "linux")).toBe(true);
    expect(isCloseWindowInput(key({ key: "F4", code: "F4" }), "win32")).toBe(true);
    expect(isCloseWindowInput(key({ code: undefined, key: "W" }), "linux")).toBe(true);
  });

  it("matches Cmd+W on macOS", () => {
    expect(isCloseWindowInput(key({ control: false, meta: true }), "darwin")).toBe(true);
    expect(isCloseWindowInput(key(), "darwin")).toBe(false);
    expect(isCloseWindowInput(key({ meta: true, key: "F4", code: "F4" }), "darwin")).toBe(false);
  });

  it("ignores other keys, key releases and Alt", () => {
    expect(isCloseWindowInput(key({ type: "keyUp" }), "win32")).toBe(false);
    expect(isCloseWindowInput(key({ control: false }), "win32")).toBe(false);
    expect(isCloseWindowInput(key({ alt: true }), "win32")).toBe(false);
    expect(isCloseWindowInput(key({ key: "t", code: "KeyT" }), "win32")).toBe(false);
  });
});

describe("windowArrowKey", () => {
  const arrow = (overrides: Record<string, unknown> = {}) =>
    key({
      type: "keyUp",
      key: "ArrowDown",
      code: "ArrowDown",
      control: false,
      meta: true,
      ...overrides,
    });

  it("reports the release of Win+Up and Win+Down on Windows", () => {
    expect(windowArrowKey(arrow(), "win32")).toBe("down");
    expect(windowArrowKey(arrow({ key: "ArrowUp", code: "ArrowUp" }), "win32")).toBe("up");
  });

  it("ignores key presses, other arrows, other modifiers and other platforms", () => {
    expect(windowArrowKey(arrow({ type: "keyDown" }), "win32")).toBeUndefined();
    expect(windowArrowKey(arrow({ key: "ArrowLeft", code: "ArrowLeft" }), "win32")).toBeUndefined();
    expect(windowArrowKey(arrow({ meta: false }), "win32")).toBeUndefined();
    expect(windowArrowKey(arrow({ shift: true }), "win32")).toBeUndefined();
    expect(windowArrowKey(arrow({ control: true }), "win32")).toBeUndefined();
    expect(windowArrowKey(arrow(), "linux")).toBeUndefined();
  });
});

describe("routeShortcutsToFocus", () => {
  class FakeWindow {
    readonly webContents = new EventEmitter();
    close = vi.fn();
    /** Press a key in this window; returns whether the press was consumed. */
    press(input: ReturnType<typeof key> & { isAutoRepeat?: boolean }): boolean {
      let prevented = false;
      this.webContents.emit(
        "before-input-event",
        { preventDefault: () => (prevented = true) },
        input,
      );
      return prevented;
    }
  }

  function fixture() {
    const app = new EventEmitter();
    const browser = new FakeWindow();
    const subTab = new FakeWindow();
    let focused: FakeWindow | null = browser;
    const active: boolean[] = [];
    routeShortcutsToFocus<FakeWindow>({
      app,
      focusedWindow: () => focused,
      shortcutWindow: (win) => shortcutWindow(win, browser, [subTab]),
      setShortcutsActive: (value) => active.push(value),
      platform: "win32",
    });
    const create = (win: FakeWindow) => {
      app.emit("browser-window-created", {}, win);
      return win;
    };
    create(browser);
    create(subTab);
    /** The OS moves focus from one window to another, or to another application. */
    const focus = (win: FakeWindow | null) => {
      const previous = focused;
      focused = win;
      if (previous) app.emit("browser-window-blur", {}, previous);
      if (win) app.emit("browser-window-focus", {}, win);
    };
    return { browser, subTab, create, focus, active };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps browser shortcuts on in the browser window and its sub-tab window", () => {
    const { browser, subTab, focus, active } = fixture();
    focus(subTab);
    focus(browser);
    vi.advanceTimersByTime(FOCUS_SETTLE_MS);
    expect(active).not.toContain(false);
  });

  it("turns browser shortcuts off while an extension pop-out has focus, and on again after", () => {
    const { browser, create, focus, active } = fixture();
    const popout = create(new FakeWindow());
    focus(popout);
    expect(active.at(-1)).toBe(false);
    vi.advanceTimersByTime(FOCUS_SETTLE_MS);
    expect(active.at(-1)).toBe(false);
    focus(browser);
    vi.advanceTimersByTime(FOCUS_SETTLE_MS);
    expect(active.at(-1)).toBe(true);
  });

  it("turns browser shortcuts off once another application has focus", () => {
    const { focus, active } = fixture();
    focus(null);
    expect(active).toEqual([]);
    vi.advanceTimersByTime(FOCUS_SETTLE_MS);
    expect(active).toEqual([false]);
  });

  it("closes a window of its own with Ctrl+W, once while the keys are held", () => {
    const { create } = fixture();
    const popup = create(new FakeWindow());
    expect(popup.press(key())).toBe(true);
    expect(popup.press({ ...key(), isAutoRepeat: true })).toBe(true);
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.press(key({ key: "t", code: "KeyT" }))).toBe(false);
  });

  it("leaves Ctrl+W in the browser window and its sub-tab window to the browser", () => {
    const { browser, subTab } = fixture();
    expect(browser.press(key())).toBe(false);
    expect(subTab.press(key())).toBe(false);
    expect(browser.close).not.toHaveBeenCalled();
    expect(subTab.close).not.toHaveBeenCalled();
  });
});
