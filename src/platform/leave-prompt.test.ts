import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { showMessageBoxSync } = vi.hoisted(() => ({ showMessageBoxSync: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showMessageBoxSync } }));

import {
  askBeforeClosingWindow,
  closePageWindow,
  confirmLeave,
  leavePromptTime,
  StayedOnPage,
  windowsWithPages,
} from "./leave-prompt";

const LEAVE = 0;
const STAY = 1;

function pageWindow() {
  const webContents = new EventEmitter();
  let destroyed = false;
  const window = Object.assign(new EventEmitter(), {
    webContents,
    isDestroyed: () => destroyed,
    // Closing runs the page's beforeunload, which may veto.
    close: vi.fn(() => {
      const event = { preventDefault: vi.fn() };
      if (vetoes) {
        webContents.emit("will-prevent-unload", event);
        if (!event.preventDefault.mock.calls.length) return;
      }
      destroyed = true;
      window.emit("closed");
    }),
  });
  let vetoes = false;
  return {
    window: window as unknown as Electron.BrowserWindow,
    warn: () => {
      vetoes = true;
    },
  };
}

describe("leaving a page", () => {
  beforeEach(() => {
    showMessageBoxSync.mockReset();
  });

  it("asks Chrome's question and accounts for the time it was shown", () => {
    const before = leavePromptTime();
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(4_000);
    showMessageBoxSync.mockReturnValue(STAY);
    expect(confirmLeave(null, "Form")).toBe(false);
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Form",
        message: "Leave this page?",
        detail: "Changes you made may not be saved.",
        buttons: ["Leave", "Stay"],
      }),
    );
    expect(leavePromptTime() - before).toBe(3_000);
  });
});

describe("closing a page window", () => {
  beforeEach(() => {
    showMessageBoxSync.mockReset();
  });

  it("closes a window without unsaved changes without asking", async () => {
    const { window } = pageWindow();
    askBeforeClosingWindow(window, () => "Pop-up");
    expect(windowsWithPages()).toContain(window);
    await closePageWindow(window);
    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(windowsWithPages()).not.toContain(window);
  });

  it("closes a warning page the user leaves", async () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => "Pop-up");
    warn();
    showMessageBoxSync.mockReturnValue(LEAVE);
    await closePageWindow(window);
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ title: "Pop-up" }),
    );
    expect(window.isDestroyed()).toBe(true);
  });

  it("leaves a warning page without asking while told to", async () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => "Pop-up");
    warn();
    await closePageWindow(window, () => true);
    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(window.isDestroyed()).toBe(true);
  });

  it("keeps a warning page the user stays on", async () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => "Pop-up");
    warn();
    showMessageBoxSync.mockReturnValue(STAY);
    await expect(closePageWindow(window)).rejects.toBeInstanceOf(StayedOnPage);
    expect(window.isDestroyed()).toBe(false);
    expect(windowsWithPages()).toContain(window);
    // Its own close button still asks, without a pending quit to notify.
    window.close();
    expect(showMessageBoxSync).toHaveBeenCalledTimes(2);
    expect((window as unknown as EventEmitter).listenerCount("closed")).toBe(1);
  });
});
