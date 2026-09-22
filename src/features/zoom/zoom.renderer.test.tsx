import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActiveZoomIndicator } from "./zoom.renderer";
import { subscribeToEvents, useZoomStore } from "./zoom.store";

let emit: (name: string, payload: unknown) => void;
let unsubscribe: () => void;
const sendCommand = vi.fn(() => Promise.resolve());

beforeEach(() => {
  useZoomStore.setState({ activeTabId: null, topSubTabs: new Map(), levels: new Map() });
  const handlers = new Map<string, (payload: unknown) => void>();
  unsubscribe = subscribeToEvents((name, callback) => {
    handlers.set(name, callback);
    return () => handlers.delete(name);
  });
  emit = (name, payload) => act(() => handlers.get(name)?.(payload));
  sendCommand.mockClear();
  vi.stubGlobal("chiaroscuro", { ...window.chiaroscuro, sendCommand });
});

afterEach(() => {
  cleanup();
  unsubscribe();
  vi.unstubAllGlobals();
});

it("tracks the active tab, ignores background zoom, and resets via the existing command", () => {
  render(<ActiveZoomIndicator />);
  emit("tabs:activated", { tabId: "a" });
  expect(screen.queryByRole("button")).toBeNull();
  emit("zoom:changed", { tabId: "b", zoomLevel: -1 });
  expect(screen.queryByRole("button")).toBeNull();
  emit("zoom:changed", { tabId: "a", zoomLevel: 1 });
  const button = screen.getByRole("button", { name: "Zoom 120%. Reset zoom to 100%" });
  expect(button.textContent).toBe("120%");
  expect(button.tabIndex).toBe(0);
  fireEvent.click(button);
  expect(sendCommand).toHaveBeenCalledWith("zoom:reset", undefined);
  emit("zoom:changed", { tabId: "a", zoomLevel: 0 });
  expect(screen.queryByRole("button")).toBeNull();
  emit("tabs:activated", { tabId: "b" });
  expect(screen.getByRole("button").textContent).toBe("83%");
  emit("tabs:activated", { tabId: null });
  expect(screen.queryByRole("button")).toBeNull();
});

it("follows nested sub-tabs, restores parent zoom, and switches between parent stacks", () => {
  render(<ActiveZoomIndicator />);
  emit("tabs:activated", { tabId: "a" });
  emit("zoom:changed", { tabId: "a", zoomLevel: 2 });
  emit("zoom:changed", { tabId: "child", zoomLevel: -1 });
  emit("sub-tabs:stack-changed", { parentTabId: "a", stack: [{ id: "child" }] });
  expect(screen.getByRole("button").textContent).toBe("83%");
  emit("sub-tabs:stack-changed", { parentTabId: "a", stack: [{ id: "child" }, { id: "nested" }] });
  expect(screen.queryByRole("button")).toBeNull();
  emit("zoom:changed", { tabId: "nested", zoomLevel: 1 });
  expect(screen.getByRole("button").textContent).toBe("120%");
  emit("tabs:activated", { tabId: "b" });
  expect(screen.queryByRole("button")).toBeNull();
  emit("tabs:activated", { tabId: "a" });
  expect(screen.getByRole("button").textContent).toBe("120%");
  emit("sub-tabs:closed", { parentTabId: "a", subTabId: "nested" });
  emit("sub-tabs:stack-changed", { parentTabId: "a", stack: [{ id: "child" }] });
  expect(screen.getByRole("button").textContent).toBe("83%");
  emit("sub-tabs:closed", { parentTabId: "a", subTabId: "child" });
  emit("sub-tabs:stack-changed", { parentTabId: "a", stack: [] });
  expect(screen.getByRole("button").textContent).toBe("144%");
  emit("tabs:closed", { tabId: "a", activatedTabId: "b" });
  expect(screen.queryByRole("button")).toBeNull();
  expect(useZoomStore.getState().levels.size).toBe(0);
});
