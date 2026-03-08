import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import {
  DOWNLOADS_COMPLETED,
  DOWNLOADS_PROGRESS,
  DOWNLOADS_STARTED,
  DOWNLOADS_STATE_CHANGED,
  type Download,
  type DownloadsEvents,
} from "./downloads.shared";

const AUTO_REMOVE_DELAY_MS = 3000;

interface DownloadsState {
  downloads: Map<string, Download>;
}

export const useDownloadsStore = create<DownloadsState>()(() => ({
  downloads: new Map(),
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<DownloadsEvents>(onEvent);
  const unsubs: (() => void)[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  unsubs.push(
    on(DOWNLOADS_STARTED, ({ download }) => {
      useDownloadsStore.setState((s) => {
        const next = new Map(s.downloads);
        next.set(download.id, download);
        return { downloads: next };
      });
    }),
  );

  unsubs.push(
    on(DOWNLOADS_PROGRESS, ({ downloadId, receivedBytes, totalBytes }) => {
      useDownloadsStore.setState((s) => {
        const existing = s.downloads.get(downloadId);
        if (!existing) return s;
        const next = new Map(s.downloads);
        next.set(downloadId, { ...existing, receivedBytes, totalBytes });
        return { downloads: next };
      });
    }),
  );

  unsubs.push(
    on(DOWNLOADS_STATE_CHANGED, ({ downloadId, state }) => {
      useDownloadsStore.setState((s) => {
        const existing = s.downloads.get(downloadId);
        if (!existing) return s;
        const next = new Map(s.downloads);
        next.set(downloadId, { ...existing, state });
        return { downloads: next };
      });
    }),
  );

  unsubs.push(
    on(DOWNLOADS_COMPLETED, ({ downloadId, state }) => {
      useDownloadsStore.setState((s) => {
        const existing = s.downloads.get(downloadId);
        if (!existing) return s;
        const next = new Map(s.downloads);
        next.set(downloadId, { ...existing, state });
        return { downloads: next };
      });

      // Auto-remove after delay
      const existingTimer = timers.get(downloadId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        timers.delete(downloadId);
        useDownloadsStore.setState((s) => {
          const next = new Map(s.downloads);
          next.delete(downloadId);
          return { downloads: next };
        });
      }, AUTO_REMOVE_DELAY_MS);
      timers.set(downloadId, timer);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
