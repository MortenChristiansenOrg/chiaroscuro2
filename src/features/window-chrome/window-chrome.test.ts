import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId } from "../../shared/types";
import { register, start, stripTrackingParams } from "./window-chrome.main";
import {
  WINDOW_CLOSE,
  WINDOW_COPY_ADDRESS,
  WINDOW_GO_BACK,
  WINDOW_GO_FORWARD,
  WINDOW_MAXIMIZED_CHANGED,
  WINDOW_MAXIMIZE_RESTORE,
  WINDOW_MINIMIZE,
  WINDOW_RELOAD,
  type WindowChromeCommands,
  type WindowChromeEvents,
} from "./window-chrome.shared";

const WIN_ID = "win-1" as WindowId;
const TAB_ID = "tab-1" as TabId;

function createMockPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    createWindow: vi.fn(),
    closeWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    unmaximizeWindow: vi.fn(),
    isWindowMaximized: vi.fn(() => false),
    focusWindow: vi.fn(),
    createTab: vi.fn(),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    navigateTab: vi.fn(),
    getTabUrl: vi.fn(() => undefined),
    getTabTitle: vi.fn(() => undefined),
    getTabFavicon: vi.fn(() => undefined),
    setTabBounds: vi.fn(),
    hideTab: vi.fn(),
    showTab: vi.fn(),
    hideAllTabs: vi.fn(),
    onTabEvent: vi.fn(() => () => {}),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    createIsolatedSession: vi.fn(),
    registerShortcut: vi.fn(),
    unregisterShortcut: vi.fn(),
    hookWebContents: vi.fn(),
    openExternal: vi.fn(),
    readClipboard: vi.fn(() => ""),
    writeClipboard: vi.fn(),
    ...overrides,
  } as Platform;
}

function setup(platformOverrides: Partial<Platform> = {}) {
  const commands = new CommandBus<WindowChromeCommands>();
  const events = new EventBus<WindowChromeEvents>();
  const platform = createMockPlatform(platformOverrides);
  const deps = {
    commands,
    events,
    platform,
    getActiveWindowId: () => WIN_ID as WindowId | undefined,
    getActiveTabId: () => TAB_ID as TabId | undefined,
  };
  register(deps);
  return { commands, events, platform, deps };
}

describe("window-chrome commands", () => {
  it("minimize delegates to platform.minimizeWindow", async () => {
    const { commands, platform } = setup();
    await commands.send(WINDOW_MINIMIZE, undefined);
    expect(platform.minimizeWindow).toHaveBeenCalledWith(WIN_ID);
  });

  it("maximize-restore maximizes when not maximized", async () => {
    const { commands, events, platform } = setup({
      isWindowMaximized: vi.fn(() => false),
    });
    const listener = vi.fn();
    events.on(WINDOW_MAXIMIZED_CHANGED, listener);

    await commands.send(WINDOW_MAXIMIZE_RESTORE, undefined);

    expect(platform.maximizeWindow).toHaveBeenCalledWith(WIN_ID);
    expect(listener).toHaveBeenCalledWith({ maximized: true });
  });

  it("maximize-restore unmaximizes when maximized", async () => {
    const { commands, events, platform } = setup({
      isWindowMaximized: vi.fn(() => true),
    });
    const listener = vi.fn();
    events.on(WINDOW_MAXIMIZED_CHANGED, listener);

    await commands.send(WINDOW_MAXIMIZE_RESTORE, undefined);

    expect(platform.unmaximizeWindow).toHaveBeenCalledWith(WIN_ID);
    expect(listener).toHaveBeenCalledWith({ maximized: false });
  });

  it("close delegates to platform.closeWindow", async () => {
    const { commands, platform } = setup();
    await commands.send(WINDOW_CLOSE, undefined);
    expect(platform.closeWindow).toHaveBeenCalledWith(WIN_ID);
  });

  it("copy-address writes URL to clipboard", async () => {
    const { commands, platform } = setup({
      getTabUrl: vi.fn(() => "https://example.com"),
    });
    await commands.send(WINDOW_COPY_ADDRESS, undefined);
    expect(platform.writeClipboard).toHaveBeenCalledWith("https://example.com");
  });

  it("copy-address strips tracking params", async () => {
    const { commands, platform } = setup({
      getTabUrl: vi.fn(() => "https://example.com/page?q=test&utm_source=google&fbclid=abc"),
    });
    await commands.send(WINDOW_COPY_ADDRESS, undefined);
    expect(platform.writeClipboard).toHaveBeenCalledWith("https://example.com/page?q=test");
  });

  it("copy-address does nothing when no active tab", async () => {
    const commands = new CommandBus<WindowChromeCommands>();
    const events = new EventBus<WindowChromeEvents>();
    const platform = createMockPlatform();
    register({
      commands,
      events,
      platform,
      getActiveWindowId: () => WIN_ID,
      getActiveTabId: () => undefined,
    });
    await commands.send(WINDOW_COPY_ADDRESS, undefined);
    expect(platform.writeClipboard).not.toHaveBeenCalled();
  });

  it("commands are no-ops when no active window", async () => {
    const commands = new CommandBus<WindowChromeCommands>();
    const events = new EventBus<WindowChromeEvents>();
    const platform = createMockPlatform();
    register({
      commands,
      events,
      platform,
      getActiveWindowId: () => undefined,
      getActiveTabId: () => undefined,
    });
    await commands.send(WINDOW_MINIMIZE, undefined);
    await commands.send(WINDOW_MAXIMIZE_RESTORE, undefined);
    await commands.send(WINDOW_CLOSE, undefined);
    expect(platform.minimizeWindow).not.toHaveBeenCalled();
    expect(platform.maximizeWindow).not.toHaveBeenCalled();
    expect(platform.closeWindow).not.toHaveBeenCalled();
  });

  it("go-back delegates to platform.goBack", async () => {
    const { commands, platform } = setup();
    await commands.send(WINDOW_GO_BACK, undefined);
    expect(platform.goBack).toHaveBeenCalledWith(TAB_ID);
  });

  it("go-forward delegates to platform.goForward", async () => {
    const { commands, platform } = setup();
    await commands.send(WINDOW_GO_FORWARD, undefined);
    expect(platform.goForward).toHaveBeenCalledWith(TAB_ID);
  });

  it("reload delegates to platform.reload", async () => {
    const { commands, platform } = setup();
    await commands.send(WINDOW_RELOAD, undefined);
    expect(platform.reload).toHaveBeenCalledWith(TAB_ID);
  });
});

describe("start()", () => {
  it("emits initial maximized state", () => {
    const { events, deps } = setup({
      isWindowMaximized: vi.fn(() => true),
    });
    const listener = vi.fn();
    events.on(WINDOW_MAXIMIZED_CHANGED, listener);

    start(deps);

    expect(listener).toHaveBeenCalledWith({ maximized: true });
  });
});

describe("stripTrackingParams", () => {
  it("removes utm_* params", () => {
    expect(stripTrackingParams("https://example.com?utm_source=x&utm_medium=y")).toBe(
      "https://example.com/",
    );
  });

  it("removes fbclid", () => {
    expect(stripTrackingParams("https://example.com?fbclid=abc123")).toBe("https://example.com/");
  });

  it("preserves non-tracking params", () => {
    expect(stripTrackingParams("https://example.com?q=hello&utm_source=x")).toBe(
      "https://example.com/?q=hello",
    );
  });

  it("returns original URL when no tracking params", () => {
    expect(stripTrackingParams("https://example.com/path?q=hello")).toBe(
      "https://example.com/path?q=hello",
    );
  });

  it("handles invalid URLs gracefully", () => {
    expect(stripTrackingParams("not-a-url")).toBe("not-a-url");
  });

  it("handles URLs with only tracking params", () => {
    const result = stripTrackingParams("https://example.com?gclid=abc&msclkid=def");
    expect(result).toBe("https://example.com/");
  });
});
