import { create } from "zustand";
import { FIND_RESULT, FIND_STARTED, FIND_STOPPED, type FindResultEvent } from "./find-text.shared";

interface FindTextState {
  active: boolean;
  activeMatchOrdinal: number;
  matches: number;
}

export const useFindTextStore = create<FindTextState>()(() => ({
  active: false,
  activeMatchOrdinal: 0,
  matches: 0,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(FIND_STARTED, () => {
      useFindTextStore.setState({ active: true, activeMatchOrdinal: 0, matches: 0 });
    }),
  );

  unsubs.push(
    onEvent(FIND_STOPPED, () => {
      useFindTextStore.setState({ active: false, activeMatchOrdinal: 0, matches: 0 });
    }),
  );

  unsubs.push(
    onEvent(FIND_RESULT, (payload) => {
      const { activeMatchOrdinal, matches } = payload as FindResultEvent;
      useFindTextStore.setState({ activeMatchOrdinal, matches });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
