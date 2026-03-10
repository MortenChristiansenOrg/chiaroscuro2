import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import {
  APP_STATE_RESTORED,
  APP_STATE_SIDEBAR_WIDTH_CHANGED,
  type AppStateEvents,
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
  const on = typedOnEvent<AppStateEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(APP_STATE_RESTORED, ({ sidebarWidth }) => {
      useAppStateStore.setState({ sidebarWidth });
    }),
  );

  unsubs.push(
    on(APP_STATE_SIDEBAR_WIDTH_CHANGED, ({ width }) => {
      useAppStateStore.setState({ sidebarWidth: width });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
