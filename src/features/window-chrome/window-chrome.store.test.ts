import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { TAB_LOADING_CHANGED, WINDOW_MAXIMIZED_CHANGED } from "./window-chrome.shared";
import { subscribeToEvents, useWindowChromeStore } from "./window-chrome.store";

function setupEventBus() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const onEvent = vi.fn((name: string, cb: (payload: unknown) => void) => {
    handlers.set(name, cb);
    return () => handlers.delete(name);
  });
  return { handlers, onEvent };
}

describe("window-chrome.store", () => {
  beforeEach(() => {
    useWindowChromeStore.setState({ maximized: false, loadingTabs: new Set() });
  });

  it("WINDOW_MAXIMIZED_CHANGED sets maximized true", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    handlers.get(WINDOW_MAXIMIZED_CHANGED)?.({ maximized: true });
    expect(useWindowChromeStore.getState().maximized).toBe(true);
  });

  it("WINDOW_MAXIMIZED_CHANGED sets maximized false", () => {
    const { handlers, onEvent } = setupEventBus();
    useWindowChromeStore.setState({ maximized: true });
    subscribeToEvents(onEvent);

    handlers.get(WINDOW_MAXIMIZED_CHANGED)?.({ maximized: false });
    expect(useWindowChromeStore.getState().maximized).toBe(false);
  });

  it("TAB_LOADING_CHANGED adds tabId to loadingTabs set", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    handlers.get(TAB_LOADING_CHANGED)?.({ tabId: "t1" as TabId, loading: true });
    expect(useWindowChromeStore.getState().loadingTabs.has("t1" as TabId)).toBe(true);
  });

  it("TAB_LOADING_CHANGED removes tabId from loadingTabs set", () => {
    const { handlers, onEvent } = setupEventBus();
    useWindowChromeStore.setState({ loadingTabs: new Set(["t1" as TabId]) });
    subscribeToEvents(onEvent);

    handlers.get(TAB_LOADING_CHANGED)?.({ tabId: "t1" as TabId, loading: false });
    expect(useWindowChromeStore.getState().loadingTabs.has("t1" as TabId)).toBe(false);
  });

  it("unsub removes all listeners", () => {
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);
    expect(handlers.size).toBe(2);

    unsub();
    expect(handlers.size).toBe(0);
  });
});
