import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { DomainCssEvents, DomainCssState, DomainNavigationState } from "./domain-css.shared";
import { DOMAIN_CSS_CHANGED, DOMAIN_NAVIGATION_CHANGED } from "./domain-css.shared";

interface DomainCssStoreState {
  /** Per-domain CSS state cache, updated from main-process events */
  states: Map<string, DomainCssState>;
  /** Per-domain navigation state cache, updated from main-process events */
  navigationStates: Map<string, DomainNavigationState>;
}

export const useDomainCssStore = create<DomainCssStoreState>()(() => ({
  states: new Map(),
  navigationStates: new Map(),
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

  unsubs.push(
    on(DOMAIN_NAVIGATION_CHANGED, (payload) => {
      useDomainCssStore.setState((prev) => {
        const next = new Map(prev.navigationStates);
        next.set(payload.domain, payload);
        return { navigationStates: next };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
