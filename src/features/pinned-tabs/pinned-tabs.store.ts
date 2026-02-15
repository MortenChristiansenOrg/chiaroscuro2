import { create } from "zustand";
import type { TabId } from "../../shared/types";
import {
  PINNED_TABS_ACTIVE_CHANGED,
  PINNED_TABS_CHANGED,
  type PinnedTab,
  type PinnedTabsActiveChangedEvent,
  type PinnedTabsChangedEvent,
} from "./pinned-tabs.shared";

interface PinnedTabsState {
  pinnedTabs: PinnedTab[];
  activePinnedTabId: TabId | null;
}

export const usePinnedTabsStore = create<PinnedTabsState>()(() => ({
  pinnedTabs: [],
  activePinnedTabId: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(PINNED_TABS_CHANGED, (payload) => {
      const { pinnedTabs } = payload as PinnedTabsChangedEvent;
      usePinnedTabsStore.setState({ pinnedTabs });
    }),
  );

  unsubs.push(
    onEvent(PINNED_TABS_ACTIVE_CHANGED, (payload) => {
      const { tabId } = payload as PinnedTabsActiveChangedEvent;
      usePinnedTabsStore.setState({ activePinnedTabId: tabId });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
