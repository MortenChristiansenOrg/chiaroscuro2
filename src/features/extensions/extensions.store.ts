import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { CWSSearchResult, ExtensionsEvents, InstalledExtension } from "./extensions.shared";
import {
  EXTENSIONS_CHANGED,
  EXTENSIONS_INSTALL_COMPLETED,
  EXTENSIONS_INSTALL_FAILED,
  EXTENSIONS_INSTALL_STARTED,
  EXTENSIONS_SEARCH_RESULTS,
} from "./extensions.shared";

interface ExtensionsState {
  extensions: InstalledExtension[];
  searchQuery: string;
  searchResults: CWSSearchResult[];
  searchLoading: boolean;
  /** Extension IDs currently being installed. */
  installing: Set<string>;
  /** Extension IDs that failed to install, with error messages. */
  installErrors: Map<string, string>;
}

export const useExtensionsStore = create<ExtensionsState>()(() => ({
  extensions: [],
  searchQuery: "",
  searchResults: [],
  searchLoading: false,
  installing: new Set(),
  installErrors: new Map(),
}));

let searchTimer: ReturnType<typeof setTimeout> | undefined;

export function setSearchQuery(query: string): void {
  useExtensionsStore.setState({ searchQuery: query, searchLoading: query.length > 0 });

  if (searchTimer) clearTimeout(searchTimer);
  if (!query.trim()) {
    useExtensionsStore.setState({ searchResults: [], searchLoading: false });
    return;
  }

  searchTimer = setTimeout(() => {
    window.chiaroscuro.sendCommand("extensions:search", { query }).catch(() => {
      useExtensionsStore.setState({ searchResults: [], searchLoading: false });
    });
  }, 400);
}

export function installExtension(extensionId: string, name: string): void {
  window.chiaroscuro.sendCommand("extensions:install", { extensionId, name }).catch(console.error);
}

export function uninstallExtension(extensionId: string): void {
  window.chiaroscuro.sendCommand("extensions:uninstall", { extensionId }).catch(console.error);
}

export function setExtensionEnabled(extensionId: string, enabled: boolean): void {
  window.chiaroscuro
    .sendCommand("extensions:set-enabled", { extensionId, enabled })
    .catch(console.error);
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<ExtensionsEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(EXTENSIONS_CHANGED, ({ extensions }) => {
      useExtensionsStore.setState({ extensions });
    }),
  );

  unsubs.push(
    on(EXTENSIONS_SEARCH_RESULTS, ({ results }) => {
      useExtensionsStore.setState({ searchResults: results, searchLoading: false });
    }),
  );

  unsubs.push(
    on(EXTENSIONS_INSTALL_STARTED, ({ extensionId }) => {
      useExtensionsStore.setState((state) => {
        const next = new Set(state.installing);
        next.add(extensionId);
        const errors = new Map(state.installErrors);
        errors.delete(extensionId);
        return { installing: next, installErrors: errors };
      });
    }),
  );

  unsubs.push(
    on(EXTENSIONS_INSTALL_COMPLETED, ({ extensionId }) => {
      useExtensionsStore.setState((state) => {
        const next = new Set(state.installing);
        next.delete(extensionId);
        return { installing: next };
      });
    }),
  );

  unsubs.push(
    on(EXTENSIONS_INSTALL_FAILED, ({ extensionId, error }) => {
      useExtensionsStore.setState((state) => {
        const nextInstalling = new Set(state.installing);
        nextInstalling.delete(extensionId);
        const errors = new Map(state.installErrors);
        errors.set(extensionId, error);
        return { installing: nextInstalling, installErrors: errors };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
