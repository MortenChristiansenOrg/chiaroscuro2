import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId } from "../../shared/types";
import {
  TABS_CLOSED,
  TABS_CREATED,
  type TabsClosedEvent,
  type TabsCreatedEvent,
} from "../tabs/tabs.shared";
import {
  ZOOM_CHANGED,
  ZOOM_DEFAULT,
  ZOOM_IN,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_OUT,
  ZOOM_RESET,
  ZOOM_STEP,
  type ZoomCommands,
  type ZoomEvents,
} from "./zoom.shared";

type AllEvents = ZoomEvents & { [K in typeof TABS_CREATED]: TabsCreatedEvent } & {
  [K in typeof TABS_CLOSED]: TabsClosedEvent;
};

interface Deps {
  commands: CommandBus<ZoomCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveTabId: () => TabId | undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function register({ commands, events, platform, getActiveTabId }: Deps): void {
  const tabCleanups = new Map<TabId, () => void>();

  // ── Command handlers ───────────────────────────────────────────

  commands.handle(ZOOM_IN, async () => {
    const tabId = getActiveTabId();
    if (!tabId) return;
    const current = platform.getTabZoomLevel(tabId);
    const next = clamp(current + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    if (next === current) return;
    platform.setTabZoomLevel(tabId, next);
    events.emit(ZOOM_CHANGED, { tabId, zoomLevel: next });
  });

  commands.handle(ZOOM_OUT, async () => {
    const tabId = getActiveTabId();
    if (!tabId) return;
    const current = platform.getTabZoomLevel(tabId);
    const next = clamp(current - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    if (next === current) return;
    platform.setTabZoomLevel(tabId, next);
    events.emit(ZOOM_CHANGED, { tabId, zoomLevel: next });
  });

  commands.handle(ZOOM_RESET, async () => {
    const tabId = getActiveTabId();
    if (!tabId) return;
    const current = platform.getTabZoomLevel(tabId);
    if (current === ZOOM_DEFAULT) return;
    platform.setTabZoomLevel(tabId, ZOOM_DEFAULT);
    events.emit(ZOOM_CHANGED, { tabId, zoomLevel: ZOOM_DEFAULT });
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────

  const zoomIn = () => commands.send(ZOOM_IN, undefined).catch(console.error);
  const zoomOut = () => commands.send(ZOOM_OUT, undefined).catch(console.error);
  const zoomReset = () => commands.send(ZOOM_RESET, undefined).catch(console.error);

  // "=" for US layouts, "Plus" for layouts where + is the primary key
  platform.registerShortcut("CommandOrControl+=", zoomIn);
  platform.registerShortcut("CommandOrControl+Plus", zoomIn);
  platform.registerShortcut("CommandOrControl+-", zoomOut);
  platform.registerShortcut("CommandOrControl+0", zoomReset);

  // ── Ctrl+MouseWheel zoom ─────────────────────────────────────────
  // The tab preload applies zoom directly via webFrame and notifies
  // the main process. This handler reads the already-applied level,
  // clamps if needed, and emits the bus event for UI updates.

  events.on(TABS_CREATED, ({ tab }) => {
    const cleanup = platform.onTabEvent(tab.id, "zoom-changed", () => {
      const level = platform.getTabZoomLevel(tab.id);
      const clamped = clamp(level, ZOOM_MIN, ZOOM_MAX);
      if (clamped !== level) {
        platform.setTabZoomLevel(tab.id, clamped);
      }
      events.emit(ZOOM_CHANGED, { tabId: tab.id, zoomLevel: clamped });
    });
    tabCleanups.set(tab.id, cleanup);
  });

  events.on(TABS_CLOSED, ({ tabId }) => {
    tabCleanups.get(tabId)?.();
    tabCleanups.delete(tabId);
  });
}
