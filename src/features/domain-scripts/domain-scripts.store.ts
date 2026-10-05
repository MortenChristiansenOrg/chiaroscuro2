import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type {
  DomainScript,
  DomainScriptsEvents,
  DomainScriptsExecutedEvent,
} from "./domain-scripts.shared";

interface DomainScriptsStoreState {
  scriptsByDomain: Map<string, DomainScript[]>;
  results: Map<string, DomainScriptsExecutedEvent>;
}

export const useDomainScriptsStore = create<DomainScriptsStoreState>()(() => ({
  scriptsByDomain: new Map(),
  results: new Map(),
}));

/** Hydrate the renderer cache without overwriting a newer main-process push. */
export async function loadDomainScripts(domain: string): Promise<void> {
  const previous = useDomainScriptsStore.getState().scriptsByDomain.get(domain);
  const scripts = (await window.chiaroscuro.sendCommand("domain-scripts:list", {
    domain,
  })) as DomainScript[];
  useDomainScriptsStore.setState((state) => {
    if (state.scriptsByDomain.get(domain) !== previous) return state;
    const scriptsByDomain = new Map(state.scriptsByDomain);
    scriptsByDomain.set(domain, scripts);
    return { scriptsByDomain };
  });
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<DomainScriptsEvents>(onEvent);
  const unsubs = [
    on("domain-scripts:changed", ({ domain, scripts }) => {
      useDomainScriptsStore.setState((state) => {
        const scriptsByDomain = new Map(state.scriptsByDomain);
        scriptsByDomain.set(domain, scripts);
        const results = new Map(state.results);
        const survivingIds = new Set(scripts.map((script) => script.id));
        for (const [id, result] of results) {
          if (result.domain === domain && !survivingIds.has(id)) results.delete(id);
        }
        return { scriptsByDomain, results };
      });
    }),
    on("domain-scripts:executed", (result) => {
      useDomainScriptsStore.setState((state) => {
        const results = new Map(state.results);
        results.set(result.id, result);
        return { results };
      });
    }),
  ];
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
