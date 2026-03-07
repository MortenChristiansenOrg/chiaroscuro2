import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { PlatformDownload } from "../../platform/types";
import { createMockPlatform } from "../../test-utils";
import feature from "./downloads.main";
import {
  DOWNLOADS_CANCEL,
  DOWNLOADS_COMPLETED,
  DOWNLOADS_PAUSE,
  DOWNLOADS_PROGRESS,
  DOWNLOADS_RESUME,
  DOWNLOADS_STARTED,
  DOWNLOADS_STATE_CHANGED,
  type DownloadsCommands,
  type DownloadsCompletedEvent,
  type DownloadsEvents,
  type DownloadsProgressEvent,
  type DownloadsStartedEvent,
  type DownloadsStateChangedEvent,
} from "./downloads.shared";

type AllCommands = DownloadsCommands;
type AllEvents = DownloadsEvents;

function createMockDownload(overrides: Partial<PlatformDownload> = {}): PlatformDownload {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  let paused = false;
  let receivedBytes = 0;
  let cancelled = false;

  return {
    filename: "test-file.zip",
    url: "https://example.com/test-file.zip",
    totalBytes: 1000,
    setSavePath: vi.fn(),
    cancel: vi.fn(() => {
      cancelled = true;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    resume: vi.fn(() => {
      paused = false;
    }),
    isPaused: () => paused,
    getReceivedBytes: () => receivedBytes,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
    }),
    removeListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = listeners.get(event);
      if (list)
        listeners.set(
          event,
          list.filter((l) => l !== cb),
        );
    }),
    // Test helpers
    _emit(event: string, ...args: unknown[]) {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
    _setReceivedBytes(bytes: number) {
      receivedBytes = bytes;
    },
    ...overrides,
  } as PlatformDownload & {
    _emit: (event: string, ...args: unknown[]) => void;
    _setReceivedBytes: (bytes: number) => void;
  };
}

let downloadCallback: ((dl: PlatformDownload) => void) | undefined;

function setup() {
  downloadCallback = undefined;
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform({
    onDownload: vi.fn((cb: (dl: PlatformDownload) => void) => {
      downloadCallback = cb;
      return () => {
        downloadCallback = undefined;
      };
    }),
    getDesktopPath: vi.fn(() => "/mock/desktop"),
  });
  const deps = { commands, events, platform };
  feature.register(deps);
  return { commands, events, platform, deps };
}

function simulateDownload(
  mockDl?: ReturnType<typeof createMockDownload>,
): ReturnType<typeof createMockDownload> {
  const dl = mockDl ?? createMockDownload();
  if (!downloadCallback)
    throw new Error("feature.start() not called — no download callback registered");
  downloadCallback(dl);
  return dl;
}

describe("downloads feature", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    feature.teardown();
    vi.useRealTimers();
  });

  describe("start", () => {
    it("registers onDownload callback", () => {
      const { deps } = setup();
      feature.start(deps);
      expect(deps.platform.onDownload).toHaveBeenCalledOnce();
    });
  });

  describe("download lifecycle", () => {
    it("emits started event when download begins", () => {
      const { deps, events } = setup();
      feature.start(deps);

      const onStarted = vi.fn();
      events.on(DOWNLOADS_STARTED, onStarted);

      simulateDownload();

      expect(onStarted).toHaveBeenCalledOnce();
      const payload = onStarted.mock.calls[0][0] as DownloadsStartedEvent;
      expect(payload.download.filename).toBe("test-file.zip");
      expect(payload.download.url).toBe("https://example.com/test-file.zip");
      expect(payload.download.totalBytes).toBe(1000);
      expect(payload.download.state).toBe("progressing");
    });

    it("sets save path to desktop", () => {
      const { deps } = setup();
      feature.start(deps);

      const dl = simulateDownload();
      expect(dl.setSavePath).toHaveBeenCalledWith("/mock/desktop/test-file.zip");
    });

    it("emits progress events (throttled)", () => {
      const { deps, events } = setup();
      feature.start(deps);

      const onProgress = vi.fn();
      events.on(DOWNLOADS_PROGRESS, onProgress);

      const dl = simulateDownload() as PlatformDownload & {
        _emit: (event: string, ...args: unknown[]) => void;
        _setReceivedBytes: (bytes: number) => void;
      };

      // First update emits immediately (enough time elapsed since start)
      vi.advanceTimersByTime(500);
      dl._setReceivedBytes(200);
      dl._emit("updated");
      expect(onProgress).toHaveBeenCalledOnce();
      expect((onProgress.mock.calls[0][0] as DownloadsProgressEvent).receivedBytes).toBe(200);

      // Rapid second update is throttled
      dl._setReceivedBytes(400);
      dl._emit("updated");
      expect(onProgress).toHaveBeenCalledOnce(); // still 1

      // After throttle period, pending update fires
      vi.advanceTimersByTime(500);
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect((onProgress.mock.calls[1][0] as DownloadsProgressEvent).receivedBytes).toBe(400);
    });

    it("emits completed event when download finishes", () => {
      const { deps, events } = setup();
      feature.start(deps);

      const onCompleted = vi.fn();
      events.on(DOWNLOADS_COMPLETED, onCompleted);

      const dl = simulateDownload() as PlatformDownload & {
        _emit: (event: string, ...args: unknown[]) => void;
      };
      dl._emit("done", "completed");

      expect(onCompleted).toHaveBeenCalledOnce();
      const payload = onCompleted.mock.calls[0][0] as DownloadsCompletedEvent;
      expect(payload.state).toBe("completed");
    });

    it("emits completed with cancelled state", () => {
      const { deps, events } = setup();
      feature.start(deps);

      const onCompleted = vi.fn();
      events.on(DOWNLOADS_COMPLETED, onCompleted);

      const dl = simulateDownload() as PlatformDownload & {
        _emit: (event: string, ...args: unknown[]) => void;
      };
      dl._emit("done", "cancelled");

      expect(onCompleted).toHaveBeenCalledOnce();
      expect((onCompleted.mock.calls[0][0] as DownloadsCompletedEvent).state).toBe("cancelled");
    });

    it("cleans up listeners on done", () => {
      const { deps } = setup();
      feature.start(deps);

      const dl = simulateDownload() as PlatformDownload & {
        _emit: (event: string, ...args: unknown[]) => void;
      };
      dl._emit("done", "completed");

      expect(dl.removeListener).toHaveBeenCalledWith("updated", expect.any(Function));
      expect(dl.removeListener).toHaveBeenCalledWith("done", expect.any(Function));
    });
  });

  describe("commands", () => {
    it("pause command calls handle.pause() and emits state-changed", async () => {
      const { commands, deps, events } = setup();
      feature.start(deps);

      const onStarted = vi.fn();
      const onStateChanged = vi.fn();
      events.on(DOWNLOADS_STARTED, onStarted);
      events.on(DOWNLOADS_STATE_CHANGED, onStateChanged);

      simulateDownload();
      const { download } = onStarted.mock.calls[0][0] as DownloadsStartedEvent;

      await commands.send(DOWNLOADS_PAUSE, { downloadId: download.id });
      expect(onStateChanged).toHaveBeenCalledOnce();
      const payload = onStateChanged.mock.calls[0][0] as DownloadsStateChangedEvent;
      expect(payload.state).toBe("paused");
      expect(payload.downloadId).toBe(download.id);
    });

    it("resume command calls handle.resume() and emits state-changed", async () => {
      const { commands, deps, events } = setup();
      feature.start(deps);

      const onStarted = vi.fn();
      const onStateChanged = vi.fn();
      events.on(DOWNLOADS_STARTED, onStarted);
      events.on(DOWNLOADS_STATE_CHANGED, onStateChanged);

      simulateDownload();
      const { download } = onStarted.mock.calls[0][0] as DownloadsStartedEvent;

      await commands.send(DOWNLOADS_RESUME, { downloadId: download.id });
      expect(onStateChanged).toHaveBeenCalledOnce();
      const payload = onStateChanged.mock.calls[0][0] as DownloadsStateChangedEvent;
      expect(payload.state).toBe("progressing");
      expect(payload.downloadId).toBe(download.id);
    });

    it("cancel command calls handle.cancel()", async () => {
      const { commands, deps, events } = setup();
      feature.start(deps);

      const onStarted = vi.fn();
      events.on(DOWNLOADS_STARTED, onStarted);

      const dl = simulateDownload();
      const { download } = onStarted.mock.calls[0][0] as DownloadsStartedEvent;

      await commands.send(DOWNLOADS_CANCEL, { downloadId: download.id });
      expect(dl.cancel).toHaveBeenCalledOnce();
    });

    it("commands for unknown downloadId are no-ops", async () => {
      const { commands, deps } = setup();
      feature.start(deps);

      // Should not throw
      await commands.send(DOWNLOADS_CANCEL, { downloadId: "nonexistent" });
      await commands.send(DOWNLOADS_PAUSE, { downloadId: "nonexistent" });
      await commands.send(DOWNLOADS_RESUME, { downloadId: "nonexistent" });
    });

    it("cancel does not work after download completes", async () => {
      const { commands, deps, events } = setup();
      feature.start(deps);

      const onStarted = vi.fn();
      events.on(DOWNLOADS_STARTED, onStarted);

      const dl = simulateDownload() as PlatformDownload & {
        _emit: (event: string, ...args: unknown[]) => void;
      };
      const { download } = onStarted.mock.calls[0][0] as DownloadsStartedEvent;

      // Complete the download
      dl._emit("done", "completed");

      // Cancel after completion — should be a no-op (active map cleared)
      await commands.send(DOWNLOADS_CANCEL, { downloadId: download.id });
      expect(dl.cancel).not.toHaveBeenCalled();
    });
  });

  describe("multiple downloads", () => {
    it("tracks multiple concurrent downloads independently", () => {
      const { deps, events } = setup();
      feature.start(deps);

      const onStarted = vi.fn();
      events.on(DOWNLOADS_STARTED, onStarted);

      const dl1 = createMockDownload({ filename: "file1.zip" });
      const dl2 = createMockDownload({ filename: "file2.zip" });

      simulateDownload(dl1);
      simulateDownload(dl2);

      expect(onStarted).toHaveBeenCalledTimes(2);
      const id1 = (onStarted.mock.calls[0][0] as DownloadsStartedEvent).download.id;
      const id2 = (onStarted.mock.calls[1][0] as DownloadsStartedEvent).download.id;
      expect(id1).not.toBe(id2);
    });
  });
});
