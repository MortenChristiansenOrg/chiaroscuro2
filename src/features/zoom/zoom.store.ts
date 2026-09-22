import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import {
  SUB_TABS_CLOSED,
  SUB_TABS_STACK_CHANGED,
  type SubTabsEvents,
} from "../sub-tabs/sub-tabs.shared";
import { TABS_ACTIVATED, TABS_CLOSED, type TabsEvents } from "../tabs/tabs.shared";
import { ZOOM_CHANGED, ZOOM_DEFAULT, type ZoomEvents } from "./zoom.shared";

interface ZoomState {
  activeTabId: TabId | null;
  topSubTabs: Map<TabId, TabId>;
  levels: Map<TabId, number>;
}

export const useZoomStore = create<ZoomState>()(() => ({
  activeTabId: null,
  topSubTabs: new Map(),
  levels: new Map(),
}));

export function selectActiveZoomLevel(state: ZoomState): number {
  if (!state.activeTabId) return ZOOM_DEFAULT;
  const targetId = state.topSubTabs.get(state.activeTabId) ?? state.activeTabId;
  return state.levels.get(targetId) ?? ZOOM_DEFAULT;
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<ZoomEvents & TabsEvents & SubTabsEvents>(onEvent);
  const unsubs = [
    on(ZOOM_CHANGED, ({ tabId, zoomLevel }) => {
      useZoomStore.setState((state) => ({
        levels: new Map(state.levels).set(tabId, zoomLevel),
      }));
    }),
    on(TABS_ACTIVATED, ({ tabId }) => useZoomStore.setState({ activeTabId: tabId })),
    on(SUB_TABS_STACK_CHANGED, ({ parentTabId, stack }) => {
      useZoomStore.setState((state) => {
        const topSubTabs = new Map(state.topSubTabs);
        const top = stack.at(-1);
        if (top) topSubTabs.set(parentTabId, top.id);
        else topSubTabs.delete(parentTabId);
        return { topSubTabs };
      });
    }),
    on(SUB_TABS_CLOSED, ({ subTabId }) => {
      useZoomStore.setState((state) => {
        const levels = new Map(state.levels);
        levels.delete(subTabId);
        return { levels };
      });
    }),
    on(TABS_CLOSED, ({ tabId, activatedTabId }) => {
      useZoomStore.setState((state) => {
        const levels = new Map(state.levels);
        const topSubTabs = new Map(state.topSubTabs);
        levels.delete(tabId);
        topSubTabs.delete(tabId);
        return {
          levels,
          topSubTabs,
          activeTabId: state.activeTabId === tabId ? activatedTabId : state.activeTabId,
        };
      });
    }),
  ];
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
