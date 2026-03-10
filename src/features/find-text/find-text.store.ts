import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import { FIND_RESULT, FIND_STARTED, FIND_STOPPED, type FindTextEvents } from "./find-text.shared";

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
  const on = typedOnEvent<FindTextEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(FIND_STARTED, () => {
      useFindTextStore.setState({ active: true, activeMatchOrdinal: 0, matches: 0 });
    }),
  );

  unsubs.push(
    on(FIND_STOPPED, () => {
      useFindTextStore.setState({ active: false, activeMatchOrdinal: 0, matches: 0 });
    }),
  );

  unsubs.push(
    on(FIND_RESULT, ({ activeMatchOrdinal, matches }) => {
      useFindTextStore.setState({ activeMatchOrdinal, matches });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
