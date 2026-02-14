import type { TabId } from "../../shared/types";
import type { Tab } from "./tabs.shared";
interface TabsState {
  tabs: Map<TabId, Tab>;
  activeTabId: TabId | null;
}
export declare const useTabsStore: import("zustand").UseBoundStore<
  import("zustand").StoreApi<TabsState>
>;
export declare function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void;
