import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import {
  EXTENSIONS_CHANGED,
  type ExtensionsCommands,
  type ExtensionsEvents,
  type InstalledExtension,
} from "./extensions.shared";

interface ExtensionsState {
  extensions: InstalledExtension[];
  error?: string;
}
export const useExtensionsStore = create<ExtensionsState>()(() => ({ extensions: [] }));
export async function extensionCommand<K extends keyof ExtensionsCommands>(
  name: K,
  payload: ExtensionsCommands[K]["payload"],
): Promise<void> {
  useExtensionsStore.setState({ error: undefined });
  try {
    await window.chiaroscuro.sendCommand(name, payload);
  } catch (error) {
    useExtensionsStore.setState({ error: error instanceof Error ? error.message : String(error) });
  }
}
export function openExtensionPopup(extensionId: string): void {
  void extensionCommand("extensions:open-popup", { extensionId });
}
export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  return typedOnEvent<ExtensionsEvents>(onEvent)(EXTENSIONS_CHANGED, ({ extensions }) =>
    useExtensionsStore.setState({ extensions }),
  );
}
