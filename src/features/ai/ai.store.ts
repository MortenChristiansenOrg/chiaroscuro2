import { create } from "zustand";
import { type AiState, DEFAULT_AI_SELECTION } from "./ai.shared";

export const useAiStore = create<{ state: AiState }>(() => ({
  state: {
    connected: false,
    sharing: false,
    connecting: false,
    models: [],
    selection: { ...DEFAULT_AI_SELECTION },
  },
}));
export function subscribeToEvents() {
  const unlisten = window.chiaroscuro.onEvent("ai:changed", (state: unknown) =>
    useAiStore.setState({ state: state as AiState }),
  );
  let disposed = false;
  window.chiaroscuro
    .sendCommand("ai:get-state", {})
    .then((state) => {
      if (!disposed) useAiStore.setState({ state: state as AiState });
    })
    .catch(console.error);
  return () => {
    disposed = true;
    unlisten();
  };
}
