import type { TabId } from "../../shared/types";
interface WindowChromeState {
  maximized: boolean;
  /** Currently-loading tab IDs */
  loadingTabs: Set<TabId>;
}
export declare const useWindowChromeStore: import("zustand").UseBoundStore<
  import("zustand").StoreApi<WindowChromeState>
>;
/** Wire event bus → store. Call once at renderer startup. */
export declare function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void;
