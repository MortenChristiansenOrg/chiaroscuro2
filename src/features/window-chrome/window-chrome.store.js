import { create } from "zustand";
import { TAB_LOADING_CHANGED, WINDOW_MAXIMIZED_CHANGED } from "./window-chrome.shared";
export const useWindowChromeStore = create()(() => ({
  maximized: false,
  loadingTabs: new Set(),
}));
/** Wire event bus → store. Call once at renderer startup. */
export function subscribeToEvents(onEvent) {
  const unsubs = [];
  unsubs.push(
    onEvent(WINDOW_MAXIMIZED_CHANGED, (payload) => {
      const { maximized } = payload;
      useWindowChromeStore.setState({ maximized });
    }),
  );
  unsubs.push(
    onEvent(TAB_LOADING_CHANGED, (payload) => {
      const { tabId, loading } = payload;
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
