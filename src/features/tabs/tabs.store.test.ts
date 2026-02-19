import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { makeTab } from "../../test-utils";
import {
  TABS_ACTIVATED,
  TABS_CLOSED,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  TABS_UPDATED,
} from "./tabs.shared";
import { subscribeToEvents, useTabsStore } from "./tabs.store";

function setupEventBus() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const onEvent = vi.fn((name: string, cb: (payload: unknown) => void) => {
    handlers.set(name, cb);
    return () => handlers.delete(name);
  });
  return { handlers, onEvent };
}

describe("tabs.store", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: new Map(), activeTabId: null });
  });

  it("TABS_CREATED adds tab to map", () => {
    const { handlers } = setupEventBus();
    subscribeToEvents(handlers.set.bind(handlers) as never);
    // Actually use the setup helper properly
    const { handlers: h2, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    const tab = makeTab({ id: "t1" as TabId });
    h2.get(TABS_CREATED)?.({ tab });

    expect(useTabsStore.getState().tabs.get("t1" as TabId)).toEqual(tab);
  });

  it("TABS_CLOSED removes tab and updates activeTabId if was active", () => {
    const { handlers, onEvent } = setupEventBus();
    const tab = makeTab({ id: "t1" as TabId });
    useTabsStore.setState({ tabs: new Map([["t1" as TabId, tab]]), activeTabId: "t1" as TabId });
    subscribeToEvents(onEvent);

    handlers.get(TABS_CLOSED)?.({ tabId: "t1" as TabId, activatedTabId: "t2" as TabId });

    const state = useTabsStore.getState();
    expect(state.tabs.has("t1" as TabId)).toBe(false);
    expect(state.activeTabId).toBe("t2" as TabId);
  });

  it("TABS_CLOSED keeps activeTabId if closed tab was not active", () => {
    const { handlers, onEvent } = setupEventBus();
    const t1 = makeTab({ id: "t1" as TabId });
    const t2 = makeTab({ id: "t2" as TabId });
    useTabsStore.setState({
      tabs: new Map([
        ["t1" as TabId, t1],
        ["t2" as TabId, t2],
      ]),
      activeTabId: "t1" as TabId,
    });
    subscribeToEvents(onEvent);

    handlers.get(TABS_CLOSED)?.({ tabId: "t2" as TabId, activatedTabId: null });

    expect(useTabsStore.getState().activeTabId).toBe("t1" as TabId);
  });

  it("TABS_ACTIVATED sets activeTabId", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    handlers.get(TABS_ACTIVATED)?.({ tabId: "t5" as TabId });
    expect(useTabsStore.getState().activeTabId).toBe("t5" as TabId);
  });

  it("TABS_UPDATED updates tab in map", () => {
    const { handlers, onEvent } = setupEventBus();
    const tab = makeTab({ id: "t1" as TabId, title: "Old" });
    useTabsStore.setState({ tabs: new Map([["t1" as TabId, tab]]) });
    subscribeToEvents(onEvent);

    const updated = { ...tab, title: "New" };
    handlers.get(TABS_UPDATED)?.({ tab: updated });

    expect(useTabsStore.getState().tabs.get("t1" as TabId)?.title).toBe("New");
  });

  it("TABS_LIST_CHANGED replaces map and preserves valid activeTabId", () => {
    const { handlers, onEvent } = setupEventBus();
    const t1 = makeTab({ id: "t1" as TabId });
    const t2 = makeTab({ id: "t2" as TabId });
    useTabsStore.setState({ activeTabId: "t1" as TabId });
    subscribeToEvents(onEvent);

    handlers.get(TABS_LIST_CHANGED)?.({ tabs: [t1, t2] });

    const state = useTabsStore.getState();
    expect(state.tabs.size).toBe(2);
    expect(state.activeTabId).toBe("t1" as TabId);
  });

  it("TABS_LIST_CHANGED nulls activeTabId when tab no longer in list", () => {
    const { handlers, onEvent } = setupEventBus();
    useTabsStore.setState({ activeTabId: "gone" as TabId });
    subscribeToEvents(onEvent);

    handlers.get(TABS_LIST_CHANGED)?.({ tabs: [makeTab({ id: "t1" as TabId })] });

    expect(useTabsStore.getState().activeTabId).toBeNull();
  });

  it("unsub removes listeners", () => {
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);
    expect(handlers.size).toBeGreaterThan(0);

    unsub();
    // All unsub fns called → handlers cleared
    expect(handlers.size).toBe(0);
  });
});
