import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { DebouncedSave } from "../../shared/debounced-save";
import { defineFeature } from "../../shared/define-feature";
import type { Bounds, WindowId } from "../../shared/types";
import {
  APP_STATE_RESTORED,
  APP_STATE_SAVE,
  APP_STATE_SET_SIDEBAR_WIDTH,
  APP_STATE_SIDEBAR_WIDTH_CHANGED,
  type AppStateCommands,
  type AppStateEvents,
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_WINDOW_BOUNDS,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type PersistedAppState,
} from "./app-state.shared";

const SAVE_SETTING_KEY = "app-state";
const DEBOUNCE_MS = 500;

interface Deps {
  commands: CommandBus<AppStateCommands>;
  events: EventBus<AppStateEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveWindowId: () => WindowId | undefined;
}

let state: DebouncedSave<PersistedAppState>;

function clampSidebarWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)));
}

export default defineFeature<Deps>({
  register({ commands, events, dataStore }) {
    state = new DebouncedSave<PersistedAppState>(
      { sidebarWidth: DEFAULT_SIDEBAR_WIDTH },
      (value) => dataStore.setSetting(SAVE_SETTING_KEY, value),
      DEBOUNCE_MS,
    );

    commands.handle(APP_STATE_SET_SIDEBAR_WIDTH, async ({ width }) => {
      const clamped = clampSidebarWidth(width);
      if (clamped === state.get().sidebarWidth) return;
      state.update((prev) => ({ ...prev, sidebarWidth: clamped }));
      events.emit(APP_STATE_SIDEBAR_WIDTH_CHANGED, { width: clamped });
    });

    commands.handle(APP_STATE_SAVE, async () => {
      await state.flush();
    });
  },

  start({ events }) {
    const current = state.get();
    events.emit(APP_STATE_RESTORED, {
      sidebarWidth: current.sidebarWidth,
    });
  },
});

/** Legacy bounds are constructor defaults only; Electron's saved state takes precedence. */
export async function loadPersistedState(
  dataStore: DataStore,
  getDisplayBounds: () => Bounds[],
): Promise<PersistedAppState & { windowBounds: Bounds }> {
  const saved = await dataStore.getSetting<PersistedAppState & { windowBounds?: Bounds }>(
    SAVE_SETTING_KEY,
  );
  if (saved) {
    const { windowBounds: _legacyBounds, ...applicationState } = saved;
    state.set({
      ...applicationState,
      sidebarWidth: clampSidebarWidth(saved.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH),
    });
  }
  return {
    ...state.get(),
    windowBounds: validateBounds(saved?.windowBounds, getDisplayBounds()),
  };
}

/** Ensure window bounds are visible on at least one display. */
function validateBounds(bounds: Bounds | undefined, displays: Bounds[]): Bounds {
  if (
    !bounds ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return { ...DEFAULT_WINDOW_BOUNDS };
  if (displays.length === 0) return bounds;

  // Check if at least 100px of the window is visible on any display
  const minVisible = 100;
  const isVisible = displays.some(
    (d) =>
      bounds.x + minVisible > d.x &&
      bounds.x < d.x + d.width - minVisible &&
      bounds.y + minVisible > d.y &&
      bounds.y < d.y + d.height - minVisible,
  );

  if (isVisible && displays.some((d) => bounds.width <= d.width && bounds.height <= d.height))
    return bounds;

  // Window is off-screen — keep size, center on primary display
  const primary = displays[0] ?? { x: 0, y: 0, width: 1920, height: 1080 };
  const width = Math.min(bounds.width, primary.width);
  const height = Math.min(bounds.height, primary.height);
  return {
    x: primary.x + Math.round((primary.width - width) / 2),
    y: primary.y + Math.round((primary.height - height) / 2),
    width,
    height,
  };
}
