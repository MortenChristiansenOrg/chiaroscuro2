import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import {
  PIP_ACTIVATED,
  PIP_DEACTIVATED,
  PIP_PLAY_STATE_CHANGED,
  type PipEvents,
} from "./pip.shared";

interface PipState {
  active: boolean;
  tabId: TabId | null;
  playing: boolean;
}

export const usePipStore = create<PipState>()(() => ({
  active: false,
  tabId: null,
  playing: true,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<PipEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(PIP_ACTIVATED, ({ tabId }) => {
      usePipStore.setState({ active: true, tabId, playing: true });
    }),
  );

  unsubs.push(
    on(PIP_DEACTIVATED, () => {
      usePipStore.setState({ active: false, tabId: null, playing: true });
    }),
  );

  unsubs.push(
    on(PIP_PLAY_STATE_CHANGED, ({ playing }) => {
      usePipStore.setState({ playing });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
