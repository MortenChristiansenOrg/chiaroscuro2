import { create } from "zustand";
import {
  TABS_ACTIVATED,
  TABS_CLOSED,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  TABS_UPDATED,
} from "./tabs.shared";
export const useTabsStore = create()(() => ({
  tabs: new Map(),
  activeTabId: null,
}));
export function subscribeToEvents(onEvent) {
  const unsubs = [];
  unsubs.push(
    onEvent(TABS_CREATED, (payload) => {
      const { tab } = payload;
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.set(tab.id, tab);
        return { tabs: next };
      });
    }),
  );
  unsubs.push(
    onEvent(TABS_CLOSED, (payload) => {
      const { tabId, activatedTabId } = payload;
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
      const { tabId } = payload;
      useTabsStore.setState({ activeTabId: tabId });
    }),
  );
  unsubs.push(
    onEvent(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.set(tab.id, tab);
        return { tabs: next };
      });
    }),
  );
  unsubs.push(
    onEvent(TABS_LIST_CHANGED, (payload) => {
      const { tabs: tabList } = payload;
      const next = new Map();
      for (const tab of tabList) {
        next.set(tab.id, tab);
      }
      useTabsStore.setState({ tabs: next });
    }),
  );
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
