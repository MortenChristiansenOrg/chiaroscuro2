import { create } from "zustand";
import type { TabId } from "../../shared/types";
import {
  TAB_CUSTOMIZATION_CHANGED,
  TAB_CUSTOMIZATION_CLOSED,
  TAB_CUSTOMIZATION_OPENED,
  TAB_CUSTOMIZATION_REMOVED,
  type TabCustomization,
  type TabCustomizationChangedEvent,
  type TabCustomizationClosedEvent,
  type TabCustomizationOpenedEvent,
  type TabCustomizationRemovedEvent,
} from "./tab-customization.shared";

interface TabCustomizationState {
  customizations: Map<TabId, TabCustomization>;
  editingTabId: TabId | null;
}

export const useTabCustomizationStore = create<TabCustomizationState>()(() => ({
  customizations: new Map(),
  editingTabId: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(TAB_CUSTOMIZATION_OPENED, (payload) => {
      const { tabId } = payload as TabCustomizationOpenedEvent;
      useTabCustomizationStore.setState({ editingTabId: tabId });
    }),
  );

  unsubs.push(
    onEvent(TAB_CUSTOMIZATION_CLOSED, (payload) => {
      const { tabId } = payload as TabCustomizationClosedEvent;
      useTabCustomizationStore.setState((state) =>
        state.editingTabId === tabId ? { editingTabId: null } : state,
      );
    }),
  );

  unsubs.push(
    onEvent(TAB_CUSTOMIZATION_CHANGED, (payload) => {
      const { tabId, customization } = payload as TabCustomizationChangedEvent;
      useTabCustomizationStore.setState((prev) => {
        const next = new Map(prev.customizations);
        next.set(tabId, customization);
        return { customizations: next };
      });
    }),
  );

  unsubs.push(
    onEvent(TAB_CUSTOMIZATION_REMOVED, (payload) => {
      const { tabId } = payload as TabCustomizationRemovedEvent;
      useTabCustomizationStore.setState((prev) => {
        const next = new Map(prev.customizations);
        next.delete(tabId);
        return {
          customizations: next,
          editingTabId: prev.editingTabId === tabId ? null : prev.editingTabId,
        };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
