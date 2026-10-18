import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { WindowContentFocus } from "./window-focus";

function contents() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    // Focusing native contents emits its focus event, as Electron does.
    focus: vi.fn(() => emitter.emit("focus")),
  });
}

/** Let the current native event finish, as separate user actions do. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function fixture(canRestore: (contents: unknown) => boolean = () => true) {
  const shell = contents();
  const window = Object.assign(new EventEmitter(), {
    webContents: shell,
    isDestroyed: () => false,
  });
  const focus = new WindowContentFocus(window, canRestore);
  const page = contents();
  focus.track(page);
  /** Electron focuses the window's own contents before emitting the window's focus event. */
  const activate = () => {
    shell.focus();
    window.emit("focus");
  };
  return { shell, window, page, activate };
}

describe("returning to the browser window", () => {
  it("gives keyboard focus back to the page that had it", async () => {
    const { window, page, activate } = fixture();
    page.focus();
    await settle();
    window.emit("blur");
    page.focus.mockClear();
    activate();
    expect(page.focus).toHaveBeenCalledTimes(1);
  });

  it("ignores the shell taking focus while the window is being deactivated", async () => {
    const { shell, window, page, activate } = fixture();
    page.focus();
    await settle();
    // Windows reports the shell's focus just before the window's blur.
    shell.focus();
    window.emit("blur");
    await settle();
    page.focus.mockClear();
    activate();
    expect(page.focus).toHaveBeenCalledTimes(1);
  });

  it("keeps focus in the browser UI when the browser UI had it", async () => {
    const { shell, window, page, activate } = fixture();
    page.focus();
    await settle();
    shell.focus();
    await settle();
    window.emit("blur");
    page.focus.mockClear();
    activate();
    expect(page.focus).not.toHaveBeenCalled();
  });

  it("does not focus a page that is no longer shown or was closed", async () => {
    let shown = true;
    const hidden = fixture(() => shown);
    hidden.page.focus();
    await settle();
    hidden.window.emit("blur");
    shown = false;
    hidden.page.focus.mockClear();
    hidden.activate();
    expect(hidden.page.focus).not.toHaveBeenCalled();

    const closed = fixture();
    closed.page.focus();
    await settle();
    closed.window.emit("blur");
    closed.page.destroyed = true;
    closed.page.focus.mockClear();
    closed.activate();
    expect(closed.page.focus).not.toHaveBeenCalled();
  });

  it("restores only once per deactivation", async () => {
    const { window, page, activate } = fixture();
    page.focus();
    await settle();
    window.emit("blur");
    activate();
    page.focus.mockClear();
    // A focus event without a preceding blur, e.g. a repeated activation request.
    window.emit("focus");
    expect(page.focus).not.toHaveBeenCalled();
  });
});
