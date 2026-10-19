import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { showMessageBoxSync } = vi.hoisted(() => ({ showMessageBoxSync: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showMessageBoxSync } }));

import {
  askBeforeClosingWindow,
  closePageWindow,
  confirmLeave,
  leavePromptTime,
  pageAddress,
  StayedOnPage,
  whileShowingPage,
  windowsWithPages,
  wrapWindowLeavePrompt,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks Chrome's question and accounts for the time it was shown", () => {
    const before = leavePromptTime();
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(4_000);
    showMessageBoxSync.mockReturnValue(STAY);
    expect(confirmLeave(null, { title: "Form" })).toBe(false);
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Form",
        message: "Leave this page?",
        detail: "Form\n\nChanges you made may not be saved.",
        buttons: ["Leave", "Stay"],
      }),
    );
    expect(leavePromptTime() - before).toBe(3_000);
  });

  // #140: the page asked about may not be the one shown, and titles can be the same.
  it("names the page by title and address", () => {
    showMessageBoxSync.mockReturnValue(LEAVE);
    expect(confirmLeave(null, { title: "Draft", url: "https://mail.example.com/draft?id=2" })).toBe(
      true,
    );
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Draft",
        detail: "Draft\nmail.example.com/draft?id=2\n\nChanges you made may not be saved.",
      }),
    );
  });

  it("names a page without a title by its address alone", () => {
    showMessageBoxSync.mockReturnValue(LEAVE);
    confirmLeave(null, { title: " ", url: "https://example.com/" });
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "example.com",
        detail: "example.com\n\nChanges you made may not be saved.",
      }),
    );
  });

  it("shows a page's address readably and briefly", () => {
    expect(pageAddress("https://example.com/")).toBe("example.com");
    expect(pageAddress("http://example.com:8080/a/b/#top")).toBe("example.com:8080/a/b/#top");
    expect(pageAddress("https://example.com/caf%C3%A9")).toBe("example.com/café");
    expect(pageAddress("file:///home/user/form.html")).toBe("file:///home/user/form.html");
    expect(pageAddress("https://example.com/%E0%A4%A")).toBe("example.com/%E0%A4%A");
    expect(pageAddress("https://user:secret@example.com/a")).toBe("example.com/a");
    // Escaped line breaks and direction overrides stay escaped.
    expect(pageAddress("https://example.com/a%0Ab%E2%80%AEc%E2%80%A8")).toBe(
      "example.com/a%0Ab%E2%80%AEc%E2%80%A8",
    );
    expect(pageAddress("https://[invalid]/caf%C3%A9")).toBe("[invalid]/caf%C3%A9");
    const long = pageAddress(`https://example.com/${"a".repeat(200)}`);
    expect(long).toHaveLength(100);
    expect(long.endsWith("\u2026")).toBe(true);
  });

  it("counts time spent showing a page before asking as time spent asking", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const before = leavePromptTime();
    let shown = () => {};
    const showing = whileShowingPage(
      () =>
        new Promise<void>((resolve) => {
          shown = resolve;
        }),
    );
    now += 400;
    // Time is counted while the page is still being shown.
    expect(leavePromptTime() - before).toBe(400);
    now += 100;
    shown();
    await showing;
    now += 1_000;
    expect(leavePromptTime() - before).toBe(500);
  });

  it("counts a prompt that opens while a page is shown only once", async () => {
    let now = 20_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    showMessageBoxSync.mockImplementation(() => {
      now += 2_000;
      return STAY;
    });
    const before = leavePromptTime();
    await whileShowingPage(async () => {
      now += 100;
      confirmLeave(null, { title: "Form" });
    });
    expect(leavePromptTime() - before).toBe(2_100);
  });
});

describe("closing a page window", () => {
  beforeEach(() => {
    showMessageBoxSync.mockReset();
  });

  it("closes a window without unsaved changes without asking", async () => {
    const { window } = pageWindow();
    askBeforeClosingWindow(window, () => ({ title: "Pop-up" }));
    expect(windowsWithPages()).toContain(window);
    await closePageWindow(window);
    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(windowsWithPages()).not.toContain(window);
  });

  it("closes a warning page the user leaves", async () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => ({ title: "Pop-up" }));
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
    askBeforeClosingWindow(window, () => ({ title: "Pop-up" }));
    warn();
    await closePageWindow(window, () => true);
    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(window.isDestroyed()).toBe(true);
  });

  it("keeps a warning page without asking while told to", async () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => ({ title: "Pop-up" }));
    warn();
    await expect(closePageWindow(window, () => false)).rejects.toBeInstanceOf(StayedOnPage);
    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(window.isDestroyed()).toBe(false);
  });

  it("keeps a warning page the user stays on", async () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => ({ title: "Pop-up" }));
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

  // #151: a pop-up the user closes while a quit asks shares the quit's answer.
  it("asks through the wrapper when the user closes a page window", () => {
    const { window, warn } = pageWindow();
    askBeforeClosingWindow(window, () => ({ title: "Pop-up" }));
    warn();
    const answered = new Set<Electron.BrowserWindow>();
    wrapWindowLeavePrompt((win, ask) => answered.has(win) || ask());
    try {
      showMessageBoxSync.mockReturnValue(STAY);
      window.close();
      expect(showMessageBoxSync).toHaveBeenCalledTimes(1);
      expect(window.isDestroyed()).toBe(false);
      answered.add(window);
      window.close();
      expect(showMessageBoxSync).toHaveBeenCalledTimes(1);
      expect(window.isDestroyed()).toBe(true);
    } finally {
      wrapWindowLeavePrompt((_win, ask) => ask());
    }
  });
});
