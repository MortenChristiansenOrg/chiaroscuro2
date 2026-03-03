import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { Bounds, WindowId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import { loadPersistedState, register, start } from "./app-state.main";
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
} from "./app-state.shared";

const WINDOW_ID = "win-1" as WindowId;
const DISPLAY_BOUNDS: Bounds[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];

function setup() {
  const commands = new CommandBus<AppStateCommands>();
  const events = new EventBus<AppStateEvents>();
  const platform = createMockPlatform();
  const dataStore = new MemoryDataStore();

  const deps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId: () => WINDOW_ID,
  };

  register(deps);
  return { commands, events, platform, dataStore, deps };
}

describe("app-state:set-sidebar-width", () => {
  it("emits sidebar-width-changed with clamped value", async () => {
    const { commands, events } = setup();
    const listener = vi.fn();
    events.on(APP_STATE_SIDEBAR_WIDTH_CHANGED, listener);

    await commands.send(APP_STATE_SET_SIDEBAR_WIDTH, { width: 300 });

    expect(listener).toHaveBeenCalledWith({ width: 300 });
  });

  it("clamps below minimum", async () => {
    const { commands, events } = setup();
    const listener = vi.fn();
    events.on(APP_STATE_SIDEBAR_WIDTH_CHANGED, listener);

    await commands.send(APP_STATE_SET_SIDEBAR_WIDTH, { width: 50 });

    expect(listener).toHaveBeenCalledWith({ width: MIN_SIDEBAR_WIDTH });
  });

  it("clamps above maximum", async () => {
    const { commands, events } = setup();
    const listener = vi.fn();
    events.on(APP_STATE_SIDEBAR_WIDTH_CHANGED, listener);

    await commands.send(APP_STATE_SET_SIDEBAR_WIDTH, { width: 999 });

    expect(listener).toHaveBeenCalledWith({ width: MAX_SIDEBAR_WIDTH });
  });

  it("does not emit when value unchanged", async () => {
    const { commands, events } = setup();
    const listener = vi.fn();
    events.on(APP_STATE_SIDEBAR_WIDTH_CHANGED, listener);

    await commands.send(APP_STATE_SET_SIDEBAR_WIDTH, { width: DEFAULT_SIDEBAR_WIDTH });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("app-state:save", () => {
  it("persists state to data store", async () => {
    vi.useFakeTimers();
    try {
      const { commands, dataStore } = setup();

      await commands.send(APP_STATE_SET_SIDEBAR_WIDTH, { width: 350 });
      await commands.send(APP_STATE_SAVE, undefined);

      const saved = await dataStore.getSetting("app-state");
      expect(saved).toEqual(expect.objectContaining({ sidebarWidth: 350 }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("loadPersistedState", () => {
  it("returns defaults when no persisted state", async () => {
    // Call setup() to reset module-level state
    const { dataStore } = setup();
    const state = await loadPersistedState(dataStore, () => DISPLAY_BOUNDS);

    expect(state.sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(state.windowBounds).toEqual(DEFAULT_WINDOW_BOUNDS);
  });

  it("restores persisted sidebar width", async () => {
    const { dataStore } = setup();
    await dataStore.setSetting("app-state", {
      sidebarWidth: 300,
      windowBounds: { x: 50, y: 50, width: 1000, height: 700 },
    });

    const state = await loadPersistedState(dataStore, () => DISPLAY_BOUNDS);

    expect(state.sidebarWidth).toBe(300);
    expect(state.windowBounds).toEqual({ x: 50, y: 50, width: 1000, height: 700 });
  });

  it("clamps out-of-range sidebar width", async () => {
    const { dataStore } = setup();
    await dataStore.setSetting("app-state", {
      sidebarWidth: 9999,
      windowBounds: DEFAULT_WINDOW_BOUNDS,
    });

    const state = await loadPersistedState(dataStore, () => DISPLAY_BOUNDS);

    expect(state.sidebarWidth).toBe(MAX_SIDEBAR_WIDTH);
  });

  it("recenters window when off-screen", async () => {
    const { dataStore } = setup();
    await dataStore.setSetting("app-state", {
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      windowBounds: { x: -5000, y: -5000, width: 1200, height: 800 },
    });

    const state = await loadPersistedState(dataStore, () => DISPLAY_BOUNDS);

    expect(state.windowBounds.x).toBeGreaterThanOrEqual(0);
    expect(state.windowBounds.y).toBeGreaterThanOrEqual(0);
    expect(state.windowBounds.width).toBe(1200);
    expect(state.windowBounds.height).toBe(800);
  });
});

describe("start()", () => {
  it("emits app-state:restored with current state", () => {
    const { events, deps } = setup();
    const listener = vi.fn();
    events.on(APP_STATE_RESTORED, listener);

    start(deps);

    expect(listener).toHaveBeenCalledWith({
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      windowBounds: DEFAULT_WINDOW_BOUNDS,
    });
  });

  it("emits restored state after loading persisted data", async () => {
    const { events, dataStore, deps } = setup();

    await dataStore.setSetting("app-state", {
      sidebarWidth: 280,
      windowBounds: { x: 200, y: 100, width: 1400, height: 900 },
    });
    await loadPersistedState(dataStore, () => DISPLAY_BOUNDS);

    const listener = vi.fn();
    events.on(APP_STATE_RESTORED, listener);

    start(deps);

    expect(listener).toHaveBeenCalledWith({
      sidebarWidth: 280,
      windowBounds: { x: 200, y: 100, width: 1400, height: 900 },
    });
  });
});
