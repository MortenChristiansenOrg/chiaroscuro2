import { create } from "zustand";
import type { DomainCssChangedEvent, DomainCssState } from "./domain-css.shared";
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
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(DOMAIN_CSS_CHANGED, (payload) => {
      const { domain, enabled, hasFile } = payload as DomainCssChangedEvent;
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
