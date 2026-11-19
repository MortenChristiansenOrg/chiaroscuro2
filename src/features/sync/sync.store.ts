import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import {
  DISCONNECTED_SYNC_STATE,
  SYNC_CHANGED,
  type SyncEvents,
  type SyncState,
} from "./sync.shared";

/** `loaded` stays false until the main process has reported the real state. */
export const useSyncStore = create<{ state: SyncState; loaded: boolean }>(() => ({
  state: DISCONNECTED_SYNC_STATE,
  loaded: false,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
) {
  const on = typedOnEvent<SyncEvents>(onEvent);
  const unlisten = on(SYNC_CHANGED, (state) => useSyncStore.setState({ state, loaded: true }));
  let disposed = false;
  window.chiaroscuro
    .sendCommand("sync:get-state", {})
    .then((state) => {
      if (!disposed) useSyncStore.setState({ state: state as SyncState, loaded: true });
    })
    .catch(console.error);
  return () => {
    disposed = true;
    unlisten();
  };
}
