import { create } from "zustand";
import type { TabId } from "../../shared/types";
import {
  TERMINAL_CLEARED,
  TERMINAL_OUTPUT,
  TERMINAL_VISIBILITY_CHANGED,
  type TerminalClearedEvent,
  type TerminalLine,
  type TerminalOutputEvent,
  type TerminalVisibilityChangedEvent,
} from "./terminal.shared";

const MAX_LINES = 1000;

interface TerminalState {
  visible: boolean;
  buffers: Map<TabId, TerminalLine[]>;
}

export const useTerminalStore = create<TerminalState>()(() => ({
  visible: false,
  buffers: new Map(),
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(TERMINAL_VISIBILITY_CHANGED, (payload) => {
      const { visible } = payload as TerminalVisibilityChangedEvent;
      useTerminalStore.setState({ visible });
    }),
  );

  unsubs.push(
    onEvent(TERMINAL_OUTPUT, (payload) => {
      const { tabId, line } = payload as TerminalOutputEvent;
      useTerminalStore.setState((s) => {
        const next = new Map(s.buffers);
        const lines = [...(next.get(tabId) ?? []), line];
        if (lines.length > MAX_LINES) {
          lines.splice(0, lines.length - MAX_LINES);
        }
        next.set(tabId, lines);
        return { buffers: next };
      });
    }),
  );

  unsubs.push(
    onEvent(TERMINAL_CLEARED, (payload) => {
      const { tabId } = payload as TerminalClearedEvent;
      useTerminalStore.setState((s) => {
        const next = new Map(s.buffers);
        next.delete(tabId);
        return { buffers: next };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
