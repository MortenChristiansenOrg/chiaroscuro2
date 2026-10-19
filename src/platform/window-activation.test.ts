import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVATION_PRESS_MS, ActivationOrigin } from "./window-activation";

const WA_ACTIVE = 1;
const WA_CLICKACTIVE = 2;
const WA_INACTIVE = 0;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ActivationOrigin on Windows", () => {
  // As recorded on Windows 11: WM_ACTIVATE arrives before the window's focus event, and the press
  // can reach the window's contents before or after it.
  it("reports an activation by a click", () => {
    const origin = new ActivationOrigin("win32");
    const callback = vi.fn();
    origin.activateMessage(WA_CLICKACTIVE);
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("reports activations by the taskbar, the app itself or another program", () => {
    const origin = new ActivationOrigin("win32");
    const callback = vi.fn();
    origin.activateMessage(WA_ACTIVE);
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not take a press for the activation's origin", () => {
    const origin = new ActivationOrigin("win32");
    const callback = vi.fn();
    origin.activateMessage(WA_ACTIVE);
    origin.press();
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("follows only the latest activation", () => {
    const origin = new ActivationOrigin("win32");
    const callback = vi.fn();
    origin.activateMessage(WA_CLICKACTIVE);
    origin.focus(callback);
    vi.runAllTimers();
    origin.activateMessage(WA_INACTIVE);
    origin.blur();
    origin.activateMessage(WA_ACTIVE);
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback.mock.calls).toEqual([[true], [false]]);
  });

  it("reports nothing when the window is deactivated before the report", () => {
    const origin = new ActivationOrigin("win32");
    const callback = vi.fn();
    origin.activateMessage(WA_ACTIVE);
    origin.focus(callback);
    origin.blur();
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("ActivationOrigin elsewhere", () => {
  it("reports a click when a press arrives just after the activation", () => {
    const origin = new ActivationOrigin("linux");
    const callback = vi.fn();
    origin.focus(callback);
    vi.advanceTimersByTime(ACTIVATION_PRESS_MS / 2);
    origin.press();
    vi.advanceTimersByTime(ACTIVATION_PRESS_MS);
    expect(callback).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("reports a click when the press arrives before the activation", () => {
    const origin = new ActivationOrigin("linux");
    const callback = vi.fn();
    origin.blur();
    origin.press();
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledWith(true);
  });

  it("reports an activation without a press", () => {
    const origin = new ActivationOrigin("linux");
    const callback = vi.fn();
    origin.focus(callback);
    vi.advanceTimersByTime(ACTIVATION_PRESS_MS - 1);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    // A later press, while the window stays active, is not about its activation.
    origin.press();
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("forgets presses from before the window was last deactivated", () => {
    const origin = new ActivationOrigin("linux");
    const callback = vi.fn();
    origin.press();
    origin.blur();
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("ignores Windows' activation messages", () => {
    const origin = new ActivationOrigin("linux");
    const callback = vi.fn();
    origin.activateMessage(WA_CLICKACTIVE);
    origin.focus(callback);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledWith(false);
  });
});
