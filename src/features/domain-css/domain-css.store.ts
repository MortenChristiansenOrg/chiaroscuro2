import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { DomainCssEvents, DomainCssState } from "./domain-css.shared";
import { DOMAIN_CSS_CHANGED } from "./domain-css.shared";

interface DomainCssStoreState {
  /** Per-domain state cache, updated from main-process events */
  states: Map<string, DomainCssState>;
}

export const useDomainCssStore = create<DomainCssStoreState>()(() => ({
  states: new Map(),
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<DomainCssEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(DOMAIN_CSS_CHANGED, ({ domain, enabled, hasFile }) => {
      useDomainCssStore.setState((prev) => {
        const next = new Map(prev.states);
        next.set(domain, { domain, enabled, hasFile });
        return { states: next };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
