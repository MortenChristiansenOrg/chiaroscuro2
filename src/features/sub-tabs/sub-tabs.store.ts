import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import { TABS_ACTIVATED, type TabsEvents } from "../tabs/tabs.shared";
import {
  SUB_TABS_STACK_CHANGED,
  SUB_TABS_UPDATED,
  type SubTab,
  type SubTabsEvents,
} from "./sub-tabs.shared";

type AllEvents = SubTabsEvents & TabsEvents;

interface SubTabsState {
  /** Active parent tab's sub-tab stack (empty = no sub-tabs). */
  stack: SubTab[];
  /** Which parent tab the current stack belongs to. */
  parentTabId: TabId | null;
  /** Currently active parent tab id from tabs feature. */
  activeTabId: TabId | null;
}

export const useSubTabsStore = create<SubTabsState>()(() => ({
  stack: [],
  parentTabId: null,
  activeTabId: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<AllEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  // Track all stacks (not just active parent) so we can switch instantly
  const allStacks = new Map<TabId, SubTab[]>();

  unsubs.push(
    on(SUB_TABS_STACK_CHANGED, ({ parentTabId, stack }) => {
      if (stack.length === 0) {
        allStacks.delete(parentTabId);
      } else {
        allStacks.set(parentTabId, stack);
      }

      const { activeTabId } = useSubTabsStore.getState();
      if (activeTabId === parentTabId) {
        useSubTabsStore.setState({ stack, parentTabId });
      }
    }),
  );

  unsubs.push(
    on(SUB_TABS_UPDATED, ({ parentTabId, subTab }) => {
      const stack = allStacks.get(parentTabId);
      if (!stack) return;

      const idx = stack.findIndex((s) => s.id === subTab.id);
      if (idx === -1) return;
      stack[idx] = subTab;
      allStacks.set(parentTabId, [...stack]);

      const { activeTabId } = useSubTabsStore.getState();
      if (activeTabId === parentTabId) {
        useSubTabsStore.setState({ stack: [...stack] });
      }
    }),
  );

  unsubs.push(
    on(TABS_ACTIVATED, ({ tabId }) => {
      const stack = tabId ? (allStacks.get(tabId) ?? []) : [];
      useSubTabsStore.setState({
        activeTabId: tabId,
        stack,
        parentTabId: stack.length > 0 ? tabId : null,
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
