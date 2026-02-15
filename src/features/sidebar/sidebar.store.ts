import { create } from "zustand";
import { SIDEBAR_VISIBILITY_CHANGED, type SidebarVisibilityChangedPayload } from "./sidebar.shared";

interface SidebarState {
  visible: boolean;
}

export const useSidebarStore = create<SidebarState>()(() => ({
  visible: true,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(SIDEBAR_VISIBILITY_CHANGED, (payload) => {
      const { visible } = payload as SidebarVisibilityChangedPayload;
      useSidebarStore.setState({ visible });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
