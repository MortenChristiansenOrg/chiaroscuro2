import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { makeTab } from "../../test-utils";
import { useTabsStore } from "../tabs/tabs.store";
import { NavButtons, TitleBar, UrlPill, WindowControls } from "./window-chrome.renderer";
import { useWindowChromeStore } from "./window-chrome.store";

const mockSendCommand = vi.fn(() => Promise.resolve());

beforeEach(() => {
  mockSendCommand.mockClear();
  Object.defineProperty(window, "chiaroscuro", {
    value: { ...window.chiaroscuro, sendCommand: mockSendCommand },
    writable: true,
    configurable: true,
  });
  useTabsStore.setState({ tabs: new Map(), activeTabId: null });
  useWindowChromeStore.setState({ maximized: false, loadingTabs: new Set() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavButtons", () => {
  it("renders back, forward, reload buttons", () => {
    render(<NavButtons />);
    expect(screen.getByRole("button", { name: "Go back" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Go forward" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reload" })).toBeDefined();
  });

  it("back button sends go-back command", () => {
    render(<NavButtons />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:go-back", undefined);
  });

  it("forward button sends go-forward command", () => {
    render(<NavButtons />);
    fireEvent.click(screen.getByRole("button", { name: "Go forward" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:go-forward", undefined);
  });

  it("reload button sends reload command", () => {
    render(<NavButtons />);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:reload", undefined);
  });
});

describe("UrlPill", () => {
  it("renders nothing when no active tab URL", () => {
    render(<UrlPill />);
    // No URL pill content
    expect(screen.queryByRole("button", { name: "Copy URL" })).toBeNull();
  });

  it("displays hostname for URLs", () => {
    const tab = makeTab({ id: "t1" as TabId, url: "https://example.com/path" });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    render(<UrlPill />);
    expect(screen.getByText("example.com/path")).toBeDefined();
  });

  it("displays hostname without trailing slash for root", () => {
    const tab = makeTab({ id: "t1" as TabId, url: "https://example.com/" });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    render(<UrlPill />);
    expect(screen.getByText("example.com")).toBeDefined();
  });

  it("displays decoded Windows file path without leading slash", () => {
    const tab = makeTab({
      id: "t1" as TabId,
      url: "file:///C:/Users/morten/Desktop/Hermann%20-%20Character%20Sheet.pdf",
    });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    render(<UrlPill />);
    expect(screen.getByText("C:/Users/morten/Desktop/Hermann - Character Sheet.pdf")).toBeDefined();
  });

  it("copy button sends copy-address command", () => {
    const tab = makeTab({ id: "t1" as TabId, url: "https://example.com" });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    render(<UrlPill />);

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:copy-address", undefined);
  });

  it("copy button shows check feedback for 1.5s", () => {
    vi.useFakeTimers();
    const tab = makeTab({ id: "t1" as TabId, url: "https://example.com" });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    render(<UrlPill />);

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(screen.getByRole("button", { name: "Copied!" })).toBeDefined();

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("button", { name: "Copy URL" })).toBeDefined();

    vi.useRealTimers();
  });

  it("shows loading spinner when tab is loading", () => {
    const tab = makeTab({ id: "t1" as TabId, url: "https://example.com" });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    useWindowChromeStore.setState({ loadingTabs: new Set(["t1" as TabId]) });
    const { container } = render(<UrlPill />);

    // Loading spinner is the pointer-events-none div with url-spin animation
    const spinner = container.querySelector("[style*='url-spin']");
    expect(spinner).not.toBeNull();
  });

  it("hides loading spinner when tab not loading", () => {
    const tab = makeTab({ id: "t1" as TabId, url: "https://example.com" });
    useTabsStore.setState({
      tabs: new Map([["t1" as TabId, tab]]),
      activeTabId: "t1" as TabId,
    });
    useWindowChromeStore.setState({ loadingTabs: new Set() });
    const { container } = render(<UrlPill />);

    const spinner = container.querySelector("[style*='url-spin']");
    expect(spinner).toBeNull();
  });
});

describe("WindowControls", () => {
  it("renders minimize, maximize, close buttons", () => {
    render(<WindowControls />);
    expect(screen.getByRole("button", { name: "Minimize" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Maximize" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  it("minimize button sends minimize command", () => {
    render(<WindowControls />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:minimize", undefined);
  });

  it("maximize button sends maximize-restore command", () => {
    render(<WindowControls />);
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:maximize-restore", undefined);
  });

  it("close button sends close command", () => {
    render(<WindowControls />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockSendCommand).toHaveBeenCalledWith("window:close", undefined);
  });

  it("shows Restore label when maximized", () => {
    useWindowChromeStore.setState({ maximized: true });
    render(<WindowControls />);
    expect(screen.getByRole("button", { name: "Restore" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull();
  });

  it("shows Maximize label when not maximized", () => {
    useWindowChromeStore.setState({ maximized: false });
    render(<WindowControls />);
    expect(screen.getByRole("button", { name: "Maximize" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});

describe("TitleBar", () => {
  it("double-click sends maximize-restore command", () => {
    const { container } = render(<TitleBar />);
    // TitleBar is the outer div with select-none class
    const titleBar = container.querySelector(".select-none") as HTMLElement;
    fireEvent.doubleClick(titleBar);
    expect(mockSendCommand).toHaveBeenCalledWith("window:maximize-restore", undefined);
  });
});
