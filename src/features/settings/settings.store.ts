import { create } from "zustand";
import type { Settings, SettingsChangedEvent } from "./settings.shared";
import { SETTINGS_CHANGED } from "./settings.shared";

interface SettingsState {
  settings: Settings | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  searchQuery: "",
  setSearchQuery: (query: string) => set({ searchQuery: query }),
}));

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function saveSettings(settings: Settings): void {
  // Optimistic update
  useSettingsStore.setState({ settings });
  // Debounced persist
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.chiaroscuro.sendCommand("settings:save", settings).catch(console.error);
  }, 300);
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(SETTINGS_CHANGED, (payload) => {
      const { settings } = payload as SettingsChangedEvent;
      useSettingsStore.setState({ settings });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
