import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closePopupOnBlur, POPUP_FOCUS_GRACE_MS } from "./extension-popup";

function popupWindow() {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    close: vi.fn(),
    webContents: {
      isDevToolsOpened: (): boolean => false,
    },
  });
}

describe("closePopupOnBlur", () => {
  const browser = { name: "browser window" };
  const extensionWindow = { name: "extension pop-out" };
  let focused: unknown;

  beforeEach(() => {
    vi.useFakeTimers();
    focused = undefined;
  });
  afterEach(() => vi.useRealTimers());

  const open = () => {
    const popup = popupWindow();
    focused = popup;
    closePopupOnBlur(popup, browser, () => focused);
    return popup;
  };
  const moveFocus = (popup: ReturnType<typeof popupWindow>, to: unknown) => {
    focused = to;
    popup.emit("blur");
  };

  it("closes when focus leaves the popup", () => {
    const popup = open();
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    expect(popup.close).not.toHaveBeenCalled();
    moveFocus(popup, browser);
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it("stays open when the opening click hands focus back to the browser window", () => {
    const popup = open();
    moveFocus(popup, browser);
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("closes once shown when focus moved to a window the extension opened", () => {
    const popup = open();
    moveFocus(popup, extensionWindow);
    expect(popup.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it("closes once shown when focus left the application", () => {
    const popup = open();
    moveFocus(popup, null);
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it("stays open when focus came back to it", () => {
    const popup = open();
    moveFocus(popup, extensionWindow);
    focused = popup;
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("stays open while its DevTools are open, and leaves a closed popup alone", () => {
    const inspected = open();
    inspected.webContents.isDevToolsOpened = () => true;
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    moveFocus(inspected, browser);
    expect(inspected.close).not.toHaveBeenCalled();

    const closed = open();
    moveFocus(closed, extensionWindow);
    closed.destroyed = true;
    vi.advanceTimersByTime(POPUP_FOCUS_GRACE_MS);
    expect(closed.close).not.toHaveBeenCalled();
  });
});
