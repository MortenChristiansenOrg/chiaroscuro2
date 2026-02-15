import { create } from "zustand";
import type { TabId } from "../../shared/types";
import {
  TABS_ACTIVATED,
  TABS_CLOSED,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  TABS_UPDATED,
  type Tab,
  type TabsActivatedEvent,
  type TabsClosedEvent,
  type TabsCreatedEvent,
  type TabsListChangedEvent,
  type TabsUpdatedEvent,
} from "./tabs.shared";

interface TabsState {
  tabs: Map<TabId, Tab>;
  activeTabId: TabId | null;
}

export const useTabsStore = create<TabsState>()(() => ({
  tabs: new Map(),
  activeTabId: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(TABS_CREATED, (payload) => {
      const { tab } = payload as TabsCreatedEvent;
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.set(tab.id, tab);
        return { tabs: next };
      });
    }),
  );

  unsubs.push(
    onEvent(TABS_CLOSED, (payload) => {
      const { tabId, activatedTabId } = payload as TabsClosedEvent;
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.delete(tabId);
        return {
          tabs: next,
          activeTabId: state.activeTabId === tabId ? activatedTabId : state.activeTabId,
        };
      });
    }),
  );

  unsubs.push(
    onEvent(TABS_ACTIVATED, (payload) => {
      const { tabId } = payload as TabsActivatedEvent;
      useTabsStore.setState({ activeTabId: tabId });
    }),
  );

  unsubs.push(
    onEvent(TABS_UPDATED, (payload) => {
      const { tab } = payload as TabsUpdatedEvent;
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.set(tab.id, tab);
        return { tabs: next };
      });
    }),
  );

  unsubs.push(
    onEvent(TABS_LIST_CHANGED, (payload) => {
      const { tabs: tabList } = payload as TabsListChangedEvent;
      const next = new Map<TabId, Tab>();
      for (const tab of tabList) {
        next.set(tab.id, tab);
      }
      useTabsStore.setState((state) => ({
        tabs: next,
        activeTabId: state.activeTabId && next.has(state.activeTabId) ? state.activeTabId : null,
      }));
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
