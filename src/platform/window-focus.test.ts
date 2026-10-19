import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { WindowContentFocus } from "./window-focus";

/** Which contents has keyboard focus; only one can at a time. */
interface FocusOwner {
  current?: unknown;
}

function contents(owner: FocusOwner) {
  const emitter = new EventEmitter();
  const self = Object.assign(emitter, {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    isFocused: () => owner.current === self,
    // Focusing native contents emits its focus event, as Electron does.
    focus: vi.fn(() => {
      owner.current = self;
      emitter.emit("focus");
    }),
    press: (type = "mouseDown") => emitter.emit("input-event", {}, { type }),
  });
  return self;
}

/** Let the current native event finish, as separate user actions do. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function fixture(canRestore: (contents: unknown) => boolean = () => true) {
  const owner: FocusOwner = {};
  const shell = contents(owner);
  /** Electron focuses the window's own contents before emitting the window's focus event. */
  const activate = () => {
    window.active = true;
    shell.focus();
    window.emit("focus");
  };
  const window = Object.assign(new EventEmitter(), {
    webContents: shell,
    active: true,
    isDestroyed: () => false,
    isFocused: () => window.active,
    focus: vi.fn(activate),
  });
  const focus = new WindowContentFocus(window, canRestore);
  const page = contents(owner);
  focus.track(page);
  const deactivate = () => {
    window.active = false;
    window.emit("blur");
  };
  return { owner, shell, window, page, focus, deactivate, activate };
}

describe("returning to the browser window", () => {
  it("gives keyboard focus back to the page that had it", async () => {
    const { page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    deactivate();
    page.focus.mockClear();
    activate();
    expect(page.focus).toHaveBeenCalledTimes(1);
  });

  it("ignores the shell taking focus while the window is being deactivated", async () => {
    const { shell, page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    // Windows reports the shell's focus just before the window's blur.
    shell.focus();
    deactivate();
    await settle();
    page.focus.mockClear();
    activate();
    expect(page.focus).toHaveBeenCalledTimes(1);
  });

  it("returns to the page focused in the same moment the window was deactivated", async () => {
    const { owner, shell, page, focus, deactivate, activate } = fixture();
    const other = contents(owner);
    focus.track(other);
    page.focus();
    await settle();
    other.focus();
    shell.focus();
    deactivate();
    page.focus.mockClear();
    other.focus.mockClear();
    activate();
    expect(other.focus).toHaveBeenCalledTimes(1);
    expect(page.focus).not.toHaveBeenCalled();
  });

  it("keeps focus in the browser UI when the browser UI had it", async () => {
    const { shell, page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    shell.focus();
    await settle();
    deactivate();
    page.focus.mockClear();
    activate();
    expect(page.focus).not.toHaveBeenCalled();
  });

  it("keeps focus in the page's DevTools when they had it", async () => {
    const { page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    page.emit("devtools-focused");
    deactivate();
    page.focus.mockClear();
    activate();
    expect(page.focus).not.toHaveBeenCalled();
  });

  it("does not focus a page that is no longer shown or was closed", async () => {
    let shown = true;
    const hidden = fixture(() => shown);
    hidden.page.focus();
    await settle();
    hidden.deactivate();
    shown = false;
    hidden.page.focus.mockClear();
    hidden.activate();
    expect(hidden.page.focus).not.toHaveBeenCalled();

    const closed = fixture();
    closed.page.focus();
    await settle();
    closed.deactivate();
    closed.page.destroyed = true;
    closed.page.focus.mockClear();
    closed.activate();
    expect(closed.page.focus).not.toHaveBeenCalled();
  });

  it("lets a click into the browser UI that activates the window keep focus", async () => {
    const { shell, window, page, deactivate } = fixture();
    page.focus();
    await settle();
    deactivate();
    page.focus.mockClear();
    window.active = true;
    shell.focus();
    shell.press();
    window.emit("focus");
    expect(page.focus).not.toHaveBeenCalled();
    expect(shell.isFocused()).toBe(true);
  });

  it("follows a click into the browser UI that arrives after focus was restored", async () => {
    const { shell, page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    deactivate();
    activate();
    shell.press("mouseMove");
    expect(page.isFocused()).toBe(true);
    shell.press();
    expect(shell.isFocused()).toBe(true);
  });

  it("follows a touch on another page that activates the window", async () => {
    const { owner, window, shell, page, focus, deactivate } = fixture();
    const other = contents(owner);
    focus.track(other);
    page.focus();
    await settle();
    deactivate();
    page.focus.mockClear();
    window.active = true;
    shell.focus();
    other.press("touchStart");
    window.emit("focus");
    expect(page.focus).not.toHaveBeenCalled();
    expect(other.isFocused()).toBe(true);
  });

  it("does not take focus when the window was deactivated again before its focus event ran", async () => {
    const { shell, window, page, deactivate } = fixture();
    page.focus();
    await settle();
    deactivate();
    page.focus.mockClear();
    // Electron queues the focus event; another window became active meanwhile.
    shell.focus();
    window.emit("focus");
    expect(page.focus).not.toHaveBeenCalled();
  });

  it("restores only once per deactivation", async () => {
    const { window, page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    deactivate();
    activate();
    page.focus.mockClear();
    // A focus event without a preceding blur, e.g. a repeated activation request.
    window.emit("focus");
    expect(page.focus).not.toHaveBeenCalled();
  });

  it("keeps restoring on later switches even if the page reports no focus event", async () => {
    const { page, deactivate, activate } = fixture();
    page.focus();
    await settle();
    deactivate();
    page.focus.mockImplementation(() => false);
    activate();
    await settle();
    deactivate();
    page.focus.mockClear();
    activate();
    expect(page.focus).toHaveBeenCalledTimes(1);
  });
});

describe("contents moving between windows", () => {
  it("does not listen twice to contents tracked again after moving back", () => {
    const { page, focus } = fixture();
    const listeners = page.listenerCount("focus") + page.listenerCount("input-event");
    focus.track(page);
    expect(page.listenerCount("focus") + page.listenerCount("input-event")).toBe(listeners);
  });
});

describe("activating the window for a page", () => {
  it("gives the page keyboard focus once the window is active", () => {
    const { owner, shell, window, page, focus, deactivate } = fixture();
    shell.focus();
    deactivate();
    focus.activate(page);
    expect(window.focus).toHaveBeenCalledTimes(1);
    // Electron's own focus on the shell comes first; the page must end up with focus.
    expect(owner.current).toBe(page);
  });

  it("focuses the page directly when the window is already active", () => {
    const { owner, shell, window, page, focus } = fixture();
    shell.focus();
    focus.activate(page);
    expect(window.focus).not.toHaveBeenCalled();
    expect(owner.current).toBe(page);
  });

  it("leaves focus in the browser UI when the page is not shown", () => {
    const { owner, shell, page, focus, deactivate } = fixture(() => false);
    shell.focus();
    deactivate();
    focus.activate(page);
    expect(owner.current).toBe(shell);
  });

  it("lets a click that activates the window decide instead", () => {
    const { owner, shell, window, page, focus, deactivate } = fixture();
    shell.focus();
    deactivate();
    window.focus.mockImplementationOnce(() => {
      window.active = true;
      shell.focus();
      shell.press();
      window.emit("focus");
    });
    focus.activate(page);
    expect(owner.current).toBe(shell);
  });
});
