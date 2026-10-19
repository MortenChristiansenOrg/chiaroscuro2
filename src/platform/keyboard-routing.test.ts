import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOCUS_SETTLE_MS,
  isCloseWindowInput,
  routeShortcutsToFocus,
  shortcutWindow,
  WindowArrowKeys,
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

describe("WindowArrowKeys", () => {
  /** A key event as the sub-tab window sees it; the shell takes Win+arrow presses. */
  const event = (type: "keyDown" | "keyUp", name: string, meta: boolean, extra = {}) =>
    key({ type, key: name, code: name, control: false, meta, ...extra });
  const winDown = () => event("keyDown", "Meta", true);
  const winUp = () => event("keyUp", "Meta", false);

  /** Feed the events and collect what the gesture reports. */
  const run = (keys: WindowArrowKeys, events: ReturnType<typeof event>[]) =>
    events.map((input) => keys.input(input)).filter(Boolean);

  it("reports Win+Up and Win+Down when the arrow is released first", () => {
    const keys = new WindowArrowKeys("win32");
    expect(run(keys, [winDown(), event("keyUp", "ArrowUp", true), winUp()])).toEqual(["up"]);
    expect(run(keys, [winDown(), event("keyUp", "ArrowDown", true), winUp()])).toEqual(["down"]);
  });

  it("reports Win+Down when the Windows key is released first", () => {
    const keys = new WindowArrowKeys("win32");
    expect(run(keys, [winDown(), winUp(), event("keyUp", "ArrowDown", false)])).toEqual(["down"]);
  });

  it("reports each arrow pressed while the Windows key stays held", () => {
    const keys = new WindowArrowKeys("win32");
    const down = event("keyUp", "ArrowDown", true);
    expect(run(keys, [winDown(), down, down, winUp()])).toEqual(["down", "down"]);
  });

  it("ignores an arrow whose press reached the page", () => {
    const keys = new WindowArrowKeys("win32");
    // Held Down, then Win pressed, then Down released: no Win+Down was pressed.
    const events = [
      event("keyDown", "ArrowDown", false),
      winDown(),
      event("keyUp", "ArrowDown", true),
    ];
    expect(run(keys, events)).toEqual([]);
  });

  it("reports Win+Left and Win+Right (#134)", () => {
    const keys = new WindowArrowKeys("win32");
    expect(run(keys, [winDown(), event("keyUp", "ArrowLeft", true), winUp()])).toEqual(["left"]);
    expect(run(keys, [winDown(), event("keyUp", "ArrowRight", true), winUp()])).toEqual(["right"]);
  });

  it("reports Win+Shift+Up, Left and Right (#134)", () => {
    const keys = new WindowArrowKeys("win32");
    // As recorded on Windows: the Shift press reaches the page, the arrow's press does not.
    const withShift = (arrow: string) => [
      winDown(),
      event("keyDown", "Shift", true, { shift: true }),
      event("keyUp", arrow, true, { shift: true }),
      event("keyUp", "Shift", true),
      winUp(),
    ];
    expect(run(keys, withShift("ArrowUp"))).toEqual(["shift+up"]);
    expect(run(keys, withShift("ArrowLeft"))).toEqual(["shift+left"]);
    expect(run(keys, withShift("ArrowRight"))).toEqual(["shift+right"]);
  });

  it("ignores arrows without the Windows key, with other modifiers, and Win+Shift+Down", () => {
    const keys = new WindowArrowKeys("win32");
    expect(run(keys, [event("keyUp", "ArrowDown", false)])).toEqual([]);
    expect(run(keys, [winDown(), event("keyUp", "ArrowDown", true, { shift: true })])).toEqual([]);
    expect(run(keys, [winDown(), event("keyUp", "ArrowLeft", true, { control: true })])).toEqual(
      [],
    );
    expect(run(keys, [winDown(), event("keyUp", "ArrowRight", true, { alt: true })])).toEqual([]);
    expect(run(keys, [winDown(), event("keyUp", "Home", true)])).toEqual([]);
    // A key press after the Windows key's release ends the gesture.
    expect(
      run(keys, [
        winDown(),
        winUp(),
        event("keyDown", "a", false),
        event("keyUp", "ArrowUp", false),
      ]),
    ).toEqual([]);
  });

  it("keeps the gesture while the Windows key stays held through other keys", () => {
    let now = 0;
    const keys = new WindowArrowKeys("win32", () => now);
    // Hold Win, tap Shift, then Win+Up.
    expect(
      run(keys, [
        winDown(),
        event("keyDown", "Shift", true, { shift: true }),
        event("keyUp", "Shift", true),
      ]),
    ).toEqual([]);
    now += 400;
    expect(run(keys, [event("keyUp", "ArrowUp", true)])).toEqual(["up"]);
  });

  it("reports Win+Shift+arrow when Shift is released just before the arrow", () => {
    let now = 0;
    const keys = new WindowArrowKeys("win32", () => now);
    keys.input(winDown());
    keys.input(event("keyDown", "Shift", true, { shift: true }));
    // The shell takes the arrow's press here.
    keys.input(event("keyUp", "Shift", true));
    now += 40;
    expect(keys.input(event("keyUp", "ArrowUp", true))).toBe("shift+up");
    // Only for that arrow.
    now += 40;
    expect(keys.input(event("keyUp", "ArrowLeft", true))).toBe("left");
  });

  it("keeps ignoring a held arrow after a Win+arrow of another arrow", () => {
    const keys = new WindowArrowKeys("win32");
    // Hold Down, then Win+Up, then release Down.
    const events = [
      event("keyDown", "ArrowDown", false),
      winDown(),
      event("keyUp", "ArrowUp", true),
      event("keyUp", "ArrowDown", true),
    ];
    expect(run(keys, events)).toEqual(["up"]);
  });

  it("forgets the gesture when focus leaves", () => {
    const keys = new WindowArrowKeys("win32");
    keys.input(winDown());
    keys.reset();
    expect(keys.input(event("keyUp", "ArrowUp", true))).toBeUndefined();
  });

  it("does nothing outside Windows", () => {
    const keys = new WindowArrowKeys("linux");
    expect(run(keys, [winDown(), event("keyUp", "ArrowUp", true)])).toEqual([]);
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
