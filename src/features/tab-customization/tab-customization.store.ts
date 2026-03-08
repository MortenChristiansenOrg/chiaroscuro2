import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import {
  TAB_CUSTOMIZATION_CHANGED,
  TAB_CUSTOMIZATION_CLOSED,
  TAB_CUSTOMIZATION_OPENED,
  TAB_CUSTOMIZATION_REMOVED,
  type TabCustomization,
  type TabCustomizationEvents,
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
  const on = typedOnEvent<TabCustomizationEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(TAB_CUSTOMIZATION_OPENED, ({ tabId }) => {
      useTabCustomizationStore.setState({ editingTabId: tabId });
    }),
  );

  unsubs.push(
    on(TAB_CUSTOMIZATION_CLOSED, ({ tabId }) => {
      useTabCustomizationStore.setState((state) =>
        state.editingTabId === tabId ? { editingTabId: null } : state,
      );
    }),
  );

  unsubs.push(
    on(TAB_CUSTOMIZATION_CHANGED, ({ tabId, customization }) => {
      useTabCustomizationStore.setState((prev) => {
        const next = new Map(prev.customizations);
        next.set(tabId, customization);
        return { customizations: next };
      });
    }),
  );

  unsubs.push(
    on(TAB_CUSTOMIZATION_REMOVED, ({ tabId }) => {
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
