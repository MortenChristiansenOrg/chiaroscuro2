interface SidebarState {
  visible: boolean;
}
export declare const useSidebarStore: import("zustand").UseBoundStore<
  import("zustand").StoreApi<SidebarState>
>;
export declare function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void;
