import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId } from "../../shared/types";
import { createMockPlatform, makeTab } from "../../test-utils";
import {
  TABS_CLOSED,
  TABS_CREATED,
  type TabsClosedEvent,
  type TabsCreatedEvent,
} from "../tabs/tabs.shared";
import { register } from "./zoom.main";
import {
  ZOOM_CHANGED,
  ZOOM_DEFAULT,
  ZOOM_IN,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_OUT,
  ZOOM_RESET,
  type ZoomCommands,
  type ZoomEvents,
} from "./zoom.shared";

const TAB_ID = "tab-1" as TabId;

type AllEvents = ZoomEvents & { [K in typeof TABS_CREATED]: TabsCreatedEvent } & {
  [K in typeof TABS_CLOSED]: TabsClosedEvent;
};

function setup(opts: { initialZoom?: number } = {}) {
  const commands = new CommandBus<ZoomCommands>();
  const events = new EventBus<AllEvents>();
  let currentZoom = opts.initialZoom ?? 0;
  const platform = createMockPlatform({
    getTabZoomLevel: vi.fn(() => currentZoom),
    setTabZoomLevel: vi.fn((_tabId: TabId, level: number) => {
      currentZoom = level;
    }),
  });

  register({
    commands,
    events,
    platform,
    getActiveTabId: () => TAB_ID as TabId | undefined,
  });

  return { commands, events, platform, getZoom: () => currentZoom };
}

describe("zoom:in", () => {
  it("increases zoom by step and emits changed", async () => {
    const { commands, events, platform } = setup();
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_IN, undefined);

    expect(platform.setTabZoomLevel).toHaveBeenCalledWith(TAB_ID, 1);
    expect(changed).toHaveBeenCalledWith({ tabId: TAB_ID, zoomLevel: 1 });
  });

  it("clamps at max zoom", async () => {
    const { commands, events, platform } = setup({ initialZoom: ZOOM_MAX });
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_IN, undefined);

    expect(platform.setTabZoomLevel).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("does nothing without active tab", async () => {
    const commands = new CommandBus<ZoomCommands>();
    const events = new EventBus<AllEvents>();
    const platform = createMockPlatform();
    register({
      commands,
      events,
      platform,
      getActiveTabId: () => undefined,
    });

    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_IN, undefined);

    expect(platform.setTabZoomLevel).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("zoom:out", () => {
  it("decreases zoom by step and emits changed", async () => {
    const { commands, events, platform } = setup();
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_OUT, undefined);

    expect(platform.setTabZoomLevel).toHaveBeenCalledWith(TAB_ID, -1);
    expect(changed).toHaveBeenCalledWith({ tabId: TAB_ID, zoomLevel: -1 });
  });

  it("clamps at min zoom", async () => {
    const { commands, events, platform } = setup({ initialZoom: ZOOM_MIN });
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_OUT, undefined);

    expect(platform.setTabZoomLevel).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("zoom:reset", () => {
  it("resets zoom to default and emits changed", async () => {
    const { commands, events, platform } = setup({ initialZoom: 2 });
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_RESET, undefined);

    expect(platform.setTabZoomLevel).toHaveBeenCalledWith(TAB_ID, ZOOM_DEFAULT);
    expect(changed).toHaveBeenCalledWith({ tabId: TAB_ID, zoomLevel: ZOOM_DEFAULT });
  });

  it("does nothing when already at default", async () => {
    const { commands, events, platform } = setup({ initialZoom: ZOOM_DEFAULT });
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    await commands.send(ZOOM_RESET, undefined);

    expect(platform.setTabZoomLevel).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("keyboard shortcuts", () => {
  it("registers Ctrl+= and Ctrl+Plus for zoom in", () => {
    const { platform } = setup();
    expect(platform.registerShortcut).toHaveBeenCalledWith(
      "CommandOrControl+=",
      expect.any(Function),
    );
    expect(platform.registerShortcut).toHaveBeenCalledWith(
      "CommandOrControl+Plus",
      expect.any(Function),
    );
  });

  it("registers Ctrl+- for zoom out", () => {
    const { platform } = setup();
    expect(platform.registerShortcut).toHaveBeenCalledWith(
      "CommandOrControl+-",
      expect.any(Function),
    );
  });

  it("registers Ctrl+0 for zoom reset", () => {
    const { platform } = setup();
    expect(platform.registerShortcut).toHaveBeenCalledWith(
      "CommandOrControl+0",
      expect.any(Function),
    );
  });
});

describe("Ctrl+MouseWheel (zoom-changed)", () => {
  it("subscribes to zoom-changed on new tabs", () => {
    const { events, platform } = setup();
    const tab = makeTab({ id: "tab-new" as TabId });

    events.emit(TABS_CREATED, { tab });

    expect(platform.onTabEvent).toHaveBeenCalledWith(
      "tab-new",
      "zoom-changed",
      expect.any(Function),
    );
  });

  it("reads applied level and emits changed", () => {
    const { events, platform } = setup();
    const tab = makeTab({ id: "tab-new" as TabId });
    let onZoomChanged: (() => void) | undefined;
    vi.mocked(platform.onTabEvent).mockImplementation((_tabId, _event, cb) => {
      onZoomChanged = cb as () => void;
      return () => {};
    });

    events.emit(TABS_CREATED, { tab });
    // Preload already applied zoom to level 2
    vi.mocked(platform.getTabZoomLevel).mockReturnValue(2);
    const changed = vi.fn();
    events.on(ZOOM_CHANGED, changed);

    onZoomChanged?.();

    expect(changed).toHaveBeenCalledWith({ tabId: "tab-new", zoomLevel: 2 });
  });

  it("clamps level that exceeds max", () => {
    const { events, platform } = setup();
    const tab = makeTab({ id: "tab-new" as TabId });
    let onZoomChanged: (() => void) | undefined;
    vi.mocked(platform.onTabEvent).mockImplementation((_tabId, _event, cb) => {
      onZoomChanged = cb as () => void;
      return () => {};
    });

    events.emit(TABS_CREATED, { tab });
    vi.mocked(platform.getTabZoomLevel).mockReturnValue(5);

    onZoomChanged?.();

    expect(platform.setTabZoomLevel).toHaveBeenCalledWith("tab-new", ZOOM_MAX);
  });

  it("cleans up listener on tab close", () => {
    const { events, platform } = setup();
    const tab = makeTab({ id: "tab-new" as TabId });
    const cleanup = vi.fn();
    vi.mocked(platform.onTabEvent).mockReturnValue(cleanup);

    events.emit(TABS_CREATED, { tab });
    events.emit(TABS_CLOSED, { tabId: "tab-new" as TabId, activatedTabId: null });

    expect(cleanup).toHaveBeenCalled();
  });
});
