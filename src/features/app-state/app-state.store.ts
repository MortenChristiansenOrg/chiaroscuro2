import { create } from "zustand";
import {
  APP_STATE_RESTORED,
  APP_STATE_SIDEBAR_WIDTH_CHANGED,
  type AppStateRestoredEvent,
  type AppStateSidebarWidthChangedEvent,
  DEFAULT_SIDEBAR_WIDTH,
} from "./app-state.shared";

interface AppStateStoreState {
  sidebarWidth: number;
}

export const useAppStateStore = create<AppStateStoreState>()(() => ({
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(APP_STATE_RESTORED, (payload) => {
      const { sidebarWidth } = payload as AppStateRestoredEvent;
      useAppStateStore.setState({ sidebarWidth });
    }),
  );

  unsubs.push(
    onEvent(APP_STATE_SIDEBAR_WIDTH_CHANGED, (payload) => {
      const { width } = payload as AppStateSidebarWidthChangedEvent;
      useAppStateStore.setState({ sidebarWidth: width });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
