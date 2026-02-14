import { create } from "zustand";
import { COMMAND_PALETTE_HIDDEN, COMMAND_PALETTE_SHOWN } from "./command-palette.shared";
export const useCommandPaletteStore = create()(() => ({
  open: false,
}));
export function subscribeToEvents(onEvent) {
  const unsubs = [];
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
