import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import {
  PINNED_TABS_ACTIVE_CHANGED,
  PINNED_TABS_CHANGED,
  type PinnedTab,
  type PinnedTabsEvents,
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
  const on = typedOnEvent<PinnedTabsEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(PINNED_TABS_CHANGED, ({ pinnedTabs }) => {
      usePinnedTabsStore.setState({ pinnedTabs });
    }),
  );

  unsubs.push(
    on(PINNED_TABS_ACTIVE_CHANGED, ({ tabId }) => {
      usePinnedTabsStore.setState({ activePinnedTabId: tabId });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
