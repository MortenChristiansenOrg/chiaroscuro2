import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { makePinnedTab } from "../../test-utils";
import { PINNED_TABS_ACTIVE_CHANGED, PINNED_TABS_CHANGED } from "./pinned-tabs.shared";
import { subscribeToEvents, usePinnedTabsStore } from "./pinned-tabs.store";

function setupEventBus() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const onEvent = vi.fn((name: string, cb: (payload: unknown) => void) => {
    handlers.set(name, cb);
    return () => handlers.delete(name);
  });
  return { handlers, onEvent };
}

describe("pinned-tabs.store", () => {
  beforeEach(() => {
    usePinnedTabsStore.setState({ pinnedTabs: [], activePinnedTabId: null });
  });

  it("PINNED_TABS_CHANGED replaces array", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    const tabs = [makePinnedTab({ id: "t1" as TabId }), makePinnedTab({ id: "t2" as TabId })];
    handlers.get(PINNED_TABS_CHANGED)?.({ pinnedTabs: tabs });

    expect(usePinnedTabsStore.getState().pinnedTabs).toEqual(tabs);
  });

  it("PINNED_TABS_ACTIVE_CHANGED sets activePinnedTabId", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    handlers.get(PINNED_TABS_ACTIVE_CHANGED)?.({ tabId: "t3" as TabId });
    expect(usePinnedTabsStore.getState().activePinnedTabId).toBe("t3" as TabId);
  });

  it("PINNED_TABS_ACTIVE_CHANGED sets null", () => {
    const { handlers, onEvent } = setupEventBus();
    usePinnedTabsStore.setState({ activePinnedTabId: "t1" as TabId });
    subscribeToEvents(onEvent);

    handlers.get(PINNED_TABS_ACTIVE_CHANGED)?.({ tabId: null });
    expect(usePinnedTabsStore.getState().activePinnedTabId).toBeNull();
  });
});
