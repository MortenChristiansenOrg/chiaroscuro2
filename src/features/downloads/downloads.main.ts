import path from "node:path";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform, PlatformDownload } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import {
  DOWNLOADS_CANCEL,
  DOWNLOADS_COMPLETED,
  DOWNLOADS_PAUSE,
  DOWNLOADS_PROGRESS,
  DOWNLOADS_RESUME,
  DOWNLOADS_STARTED,
  DOWNLOADS_STATE_CHANGED,
  type Download,
  type DownloadsCommands,
  type DownloadsEvents,
} from "./downloads.shared";

type AllCommands = DownloadsCommands;
type AllEvents = DownloadsEvents;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
}

interface ActiveDownload {
  handle: PlatformDownload;
  id: string;
}

const active = new Map<string, ActiveDownload>();
const PROGRESS_THROTTLE_MS = 500;
let stopListener: (() => void) | undefined;

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events } = deps;

    commands.handle(DOWNLOADS_CANCEL, async ({ downloadId }) => {
      const dl = active.get(downloadId);
      if (dl) dl.handle.cancel();
    });

    commands.handle(DOWNLOADS_PAUSE, async ({ downloadId }) => {
      const dl = active.get(downloadId);
      if (dl) {
        dl.handle.pause();
        events.emit(DOWNLOADS_STATE_CHANGED, { downloadId, state: "paused" });
      }
    });

    commands.handle(DOWNLOADS_RESUME, async ({ downloadId }) => {
      const dl = active.get(downloadId);
      if (dl) {
        dl.handle.resume();
        events.emit(DOWNLOADS_STATE_CHANGED, { downloadId, state: "progressing" });
      }
    });
  },

  start(deps) {
    const { events, platform } = deps;
    if (stopListener) return;
    const desktopPath = platform.getDesktopPath();

    stopListener = platform.onDownload((handle) => {
      const id = crypto.randomUUID();
      const safeFilename =
        path.basename(handle.filename).replace(/[\\/]/g, "_").trim() || "download";
      handle.setSavePath(path.join(desktopPath, safeFilename));

      const entry: ActiveDownload = { handle, id };
      active.set(id, entry);

      const download: Download = {
        id,
        filename: handle.filename,
        url: handle.url,
        receivedBytes: 0,
        totalBytes: handle.totalBytes,
        state: "progressing",
      };
      events.emit(DOWNLOADS_STARTED, { download });

      // Throttled progress updates
      let lastEmit = 0;
      let pendingTimer: ReturnType<typeof setTimeout> | undefined;

      const emitProgress = () => {
        lastEmit = Date.now();
        events.emit(DOWNLOADS_PROGRESS, {
          downloadId: id,
          receivedBytes: handle.getReceivedBytes(),
          totalBytes: handle.totalBytes,
        });
      };

      const onUpdated = () => {
        const now = Date.now();
        if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = undefined;
          }
          emitProgress();
        } else if (!pendingTimer) {
          pendingTimer = setTimeout(emitProgress, PROGRESS_THROTTLE_MS - (now - lastEmit));
        }
      };

      const onDone = (state: "completed" | "cancelled" | "interrupted") => {
        if (pendingTimer) clearTimeout(pendingTimer);
        handle.removeListener("updated", onUpdated);
        handle.removeListener("done", onDone);
        active.delete(id);
        events.emit(DOWNLOADS_COMPLETED, { downloadId: id, state });
      };

      handle.on("updated", onUpdated);
      handle.on("done", onDone);
    });
  },

  teardown() {
    if (stopListener) {
      stopListener();
      stopListener = undefined;
    }
    active.clear();
  },
});
