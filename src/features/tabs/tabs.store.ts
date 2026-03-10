import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import {
  TABS_ACTIVATED,
  TABS_CLOSED,
  TABS_CREATED,
  TABS_LIST_CHANGED,
  TABS_UPDATED,
  type Tab,
  type TabsEvents,
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
  const on = typedOnEvent<TabsEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(TABS_CREATED, ({ tab }) => {
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.set(tab.id, tab);
        return { tabs: next };
      });
    }),
  );

  unsubs.push(
    on(TABS_CLOSED, ({ tabId, activatedTabId }) => {
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
    on(TABS_ACTIVATED, ({ tabId }) => {
      useTabsStore.setState({ activeTabId: tabId });
    }),
  );

  unsubs.push(
    on(TABS_UPDATED, ({ tab }) => {
      useTabsStore.setState((state) => {
        const next = new Map(state.tabs);
        next.set(tab.id, tab);
        return { tabs: next };
      });
    }),
  );

  unsubs.push(
    on(TABS_LIST_CHANGED, ({ tabs: tabList }) => {
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
