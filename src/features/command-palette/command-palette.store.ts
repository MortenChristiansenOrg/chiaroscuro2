import { create } from "zustand";
import { COMMAND_PALETTE_HIDDEN, COMMAND_PALETTE_SHOWN } from "./command-palette.shared";

interface CommandPaletteState {
  open: boolean;
}

export const useCommandPaletteStore = create<CommandPaletteState>()(() => ({
  open: false,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(COMMAND_PALETTE_SHOWN, () => {
      useCommandPaletteStore.setState({ open: true });
    }),
  );

  unsubs.push(
    onEvent(COMMAND_PALETTE_HIDDEN, () => {
      useCommandPaletteStore.setState({ open: false });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
