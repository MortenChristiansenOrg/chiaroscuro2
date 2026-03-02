import { create } from "zustand";
import { SETTINGS_CHANGED, type SettingsChangedEvent } from "../settings/settings.shared";
import { COMMAND_PALETTE_HIDDEN, COMMAND_PALETTE_SHOWN } from "./command-palette.shared";
import { setDefaultProvider, setProviders } from "./resolve-input";

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

  unsubs.push(
    onEvent(SETTINGS_CHANGED, (payload) => {
      const { settings } = payload as SettingsChangedEvent;
      setProviders(settings.searchProviders);
      setDefaultProvider(settings.defaultSearchProviderId);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
