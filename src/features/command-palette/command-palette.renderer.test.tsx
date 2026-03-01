import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteOverlay } from "./command-palette.renderer";
import { useCommandPaletteStore } from "./command-palette.store";

const mockSendCommand = vi.fn(() => Promise.resolve());

beforeEach(() => {
  mockSendCommand.mockClear();
  Object.defineProperty(window, "chiaroscuro", {
    value: { ...window.chiaroscuro, sendCommand: mockSendCommand },
    writable: true,
    configurable: true,
  });
  useCommandPaletteStore.setState({ open: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CommandPaletteOverlay", () => {
  it("renders nothing when closed", () => {
    render(<CommandPaletteOverlay />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog when open", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeDefined();
  });

  it("renders input with placeholder", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);
    expect(screen.getByPlaceholderText("Search or enter URL...")).toBeDefined();
  });

  it("Escape sends hide command", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockSendCommand).toHaveBeenCalledWith("command-palette:hide", undefined);
  });

  it("backdrop click sends hide command", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    // Click the backdrop (outermost div)
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockSendCommand).toHaveBeenCalledWith("command-palette:hide", undefined);
  });

  it("clicking dialog does NOT send hide", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    fireEvent.click(screen.getByRole("dialog"));
    expect(mockSendCommand).not.toHaveBeenCalledWith("command-palette:hide", undefined);
  });

  it("shows search resolution indicator on input", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    // Simulate typing
    Object.defineProperty(input, "value", { value: "hello world", writable: true });
    fireEvent.input(input);

    expect(screen.getByText(/Search with/)).toBeDefined();
    expect(screen.getByText("Google")).toBeDefined();
  });

  it("shows URL resolution indicator for URLs", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    Object.defineProperty(input, "value", { value: "https://example.com", writable: true });
    fireEvent.input(input);

    expect(screen.getByText(/Navigate to/)).toBeDefined();
  });

  it("Enter sends execute command", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    Object.defineProperty(input, "value", { value: "hello world", writable: true });
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockSendCommand).toHaveBeenCalledWith("command-palette:execute", {
      command: "hello world",
      inCurrentTab: false,
    });
  });

  it("Ctrl+Enter sends execute with inCurrentTab", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    Object.defineProperty(input, "value", { value: "hello world", writable: true });
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    expect(mockSendCommand).toHaveBeenCalledWith("command-palette:execute", {
      command: "hello world",
      inCurrentTab: true,
    });
  });

  it("empty input does not send execute on Enter", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockSendCommand).not.toHaveBeenCalledWith("command-palette:execute", expect.anything());
  });

  it("debounced search fires after 150ms", () => {
    vi.useFakeTimers();
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    Object.defineProperty(input, "value", { value: "test query", writable: true });
    fireEvent.input(input);

    // Not called yet
    expect(mockSendCommand).not.toHaveBeenCalledWith(
      "command-palette:search-visits",
      expect.anything(),
    );

    act(() => vi.advanceTimersByTime(150));

    expect(mockSendCommand).toHaveBeenCalledWith("command-palette:search-visits", {
      query: "test query",
    });

    vi.useRealTimers();
  });

  it("short input (<2 chars) does not trigger search", () => {
    vi.useFakeTimers();
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    const input = screen.getByPlaceholderText("Search or enter URL...");
    Object.defineProperty(input, "value", { value: "a", writable: true });
    fireEvent.input(input);

    act(() => vi.advanceTimersByTime(200));

    expect(mockSendCommand).not.toHaveBeenCalledWith(
      "command-palette:search-visits",
      expect.anything(),
    );

    vi.useRealTimers();
  });

  it("shows help text with keyboard shortcuts", () => {
    useCommandPaletteStore.setState({ open: true });
    render(<CommandPaletteOverlay />);

    // Check for the help text at the bottom
    expect(screen.getByText(/Enter = new tab/)).toBeDefined();
    expect(screen.getByText(/Ctrl\+Enter = current tab/)).toBeDefined();
    expect(screen.getByText(/Esc = close/)).toBeDefined();
  });
});
