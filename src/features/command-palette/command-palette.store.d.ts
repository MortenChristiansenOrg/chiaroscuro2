interface CommandPaletteState {
  open: boolean;
}
export declare const useCommandPaletteStore: import("zustand").UseBoundStore<
  import("zustand").StoreApi<CommandPaletteState>
>;
export declare function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void;
