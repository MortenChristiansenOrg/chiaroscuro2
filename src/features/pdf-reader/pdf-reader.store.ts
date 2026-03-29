import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { IndexEntry, PdfReaderEvents } from "./pdf-reader.shared";
import { PDF_READER_INDEX_CHANGED } from "./pdf-reader.shared";

interface PdfReaderState {
  /** Index entries keyed by pdfKey */
  indexes: Map<string, IndexEntry[]>;
}

export const usePdfReaderStore = create<PdfReaderState>()(() => ({
  indexes: new Map(),
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<PdfReaderEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(PDF_READER_INDEX_CHANGED, ({ pdfKey, entries }) => {
      usePdfReaderStore.setState((state) => {
        const indexes = new Map(state.indexes);
        indexes.set(pdfKey, entries);
        return { indexes };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
