import { create } from "zustand";
import { DISCONNECTED_SYNC_STATE, SYNC_CHANGED, type SyncState } from "./sync.shared";

export const useSyncStore = create<{ state: SyncState }>(() => ({
  state: DISCONNECTED_SYNC_STATE,
}));

export function subscribeToEvents() {
  const unlisten = window.chiaroscuro.onEvent(SYNC_CHANGED, (state: unknown) =>
    useSyncStore.setState({ state: state as SyncState }),
  );
  let disposed = false;
  window.chiaroscuro
    .sendCommand("sync:get-state", {})
    .then((state) => {
      if (!disposed) useSyncStore.setState({ state: state as SyncState });
    })
    .catch(console.error);
  return () => {
    disposed = true;
    unlisten();
  };
}
