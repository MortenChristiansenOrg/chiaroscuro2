import { create } from "zustand";
import { SIDEBAR_VISIBILITY_CHANGED } from "./sidebar.shared";
export const useSidebarStore = create()(() => ({
  visible: true,
}));
export function subscribeToEvents(onEvent) {
  const unsubs = [];
  unsubs.push(
    onEvent(SIDEBAR_VISIBILITY_CHANGED, (payload) => {
      const { visible } = payload;
      useSidebarStore.setState({ visible });
    }),
  );
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
