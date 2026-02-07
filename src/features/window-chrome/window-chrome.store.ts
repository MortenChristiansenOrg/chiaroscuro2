import { create } from "zustand";
import type { TabId } from "../../shared/types";
import {
  type MaximizedChangedPayload,
  TAB_LOADING_CHANGED,
  type TabLoadingChangedPayload,
  WINDOW_MAXIMIZED_CHANGED,
} from "./window-chrome.shared";

interface WindowChromeState {
  maximized: boolean;
  /** Currently-loading tab IDs */
  loadingTabs: Set<TabId>;
}

export const useWindowChromeStore = create<WindowChromeState>()(() => ({
  maximized: false,
  loadingTabs: new Set(),
}));

/** Wire event bus → store. Call once at renderer startup. */
export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(WINDOW_MAXIMIZED_CHANGED, (payload) => {
      const { maximized } = payload as MaximizedChangedPayload;
      useWindowChromeStore.setState({ maximized });
    }),
  );

  unsubs.push(
    onEvent(TAB_LOADING_CHANGED, (payload) => {
      const { tabId, loading } = payload as TabLoadingChangedPayload;
      useWindowChromeStore.setState((state) => {
        const next = new Set(state.loadingTabs);
        if (loading) next.add(tabId);
        else next.delete(tabId);
        return { loadingTabs: next };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
