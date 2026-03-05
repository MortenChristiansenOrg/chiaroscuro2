import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId, WindowId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
// biome-ignore lint/style/useImportType: TABS_ACTIVATED used in typeof for mapped type
import {
  TABS_ACTIVATED,
  TABS_CLOSED,
  type TabsActivatedEvent,
  type TabsClosedEvent,
} from "../tabs/tabs.shared";
import { register } from "./find-text.main";
import {
  FIND_NEXT,
  FIND_PREVIOUS,
  FIND_RESULT,
  FIND_START,
  FIND_STARTED,
  FIND_STOP,
  FIND_STOPPED,
  type FindTextCommands,
  type FindTextEvents,
} from "./find-text.shared";

const TAB_ID = "tab-1" as TabId;
const WIN_ID = "win-1" as WindowId;

type AllEvents = FindTextEvents & {
  [K in typeof TABS_ACTIVATED]: TabsActivatedEvent;
} & {
  [K in typeof TABS_CLOSED]: TabsClosedEvent;
};

function setup(opts: { tabId?: TabId | null } = {}) {
  const commands = new CommandBus<FindTextCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform();
  const activeTabId = opts.tabId === null ? undefined : (opts.tabId ?? TAB_ID);

  register({
    commands,
    events,
    platform,
    getActiveTabId: () => activeTabId,
    getActiveWindowId: () => WIN_ID,
  });

  return { commands, events, platform };
}

describe("find:start", () => {
  it("emits find:started event", async () => {
    const { commands, events } = setup();
    const started = vi.fn();
    events.on(FIND_STARTED, started);

    await commands.send(FIND_START, undefined);

    expect(started).toHaveBeenCalled();
  });

  it("focuses shell so the find input can receive focus", async () => {
    const { commands, platform } = setup();

    await commands.send(FIND_START, undefined);

    expect(platform.focusShell).toHaveBeenCalledWith(WIN_ID);
  });
});

describe("find:stop", () => {
  it("calls stopFindInPage and emits find:stopped", async () => {
    const { commands, events, platform } = setup();
    const stopped = vi.fn();
    events.on(FIND_STOPPED, stopped);

    await commands.send(FIND_START, undefined);
    await commands.send(FIND_STOP, undefined);

    expect(platform.stopFindInPage).toHaveBeenCalledWith(TAB_ID);
    expect(stopped).toHaveBeenCalled();
  });

  it("does nothing if find not active", async () => {
    const { commands, events, platform } = setup();
    const stopped = vi.fn();
    events.on(FIND_STOPPED, stopped);

    await commands.send(FIND_STOP, undefined);

    expect(platform.stopFindInPage).not.toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
  });
});

describe("find:next", () => {
  it("calls findInPage with forward:true", async () => {
    const { commands, platform } = setup();

    await commands.send(FIND_NEXT, { text: "hello" });

    expect(platform.findInPage).toHaveBeenCalledWith(TAB_ID, "hello", {
      forward: true,
      findNext: true,
    });
  });

  it("starts find mode if not active", async () => {
    const { commands, events } = setup();
    const started = vi.fn();
    events.on(FIND_STARTED, started);

    await commands.send(FIND_NEXT, { text: "hello" });

    expect(started).toHaveBeenCalled();
  });

  it("does nothing without active tab", async () => {
    const { commands, platform } = setup({ tabId: null });

    await commands.send(FIND_NEXT, { text: "hello" });

    expect(platform.findInPage).not.toHaveBeenCalled();
  });

  it("does nothing with empty text", async () => {
    const { commands, platform } = setup();

    await commands.send(FIND_NEXT, { text: "" });

    expect(platform.findInPage).not.toHaveBeenCalled();
  });

  it("listens for found-in-page events and emits find:result", async () => {
    const { commands, events, platform } = setup();
    let foundCallback: ((...args: unknown[]) => void) | undefined;

    (platform.onTabEvent as ReturnType<typeof vi.fn>).mockImplementation((_tabId, event, cb) => {
      if (event === "found-in-page") foundCallback = cb;
      return () => {};
    });

    const result = vi.fn();
    events.on(FIND_RESULT, result);

    await commands.send(FIND_NEXT, { text: "test" });

    foundCallback?.({}, { activeMatchOrdinal: 2, matches: 5, finalUpdate: true });

    expect(result).toHaveBeenCalledWith({
      activeMatchOrdinal: 2,
      matches: 5,
    });
  });

  it("ignores non-final found-in-page results", async () => {
    const { commands, events, platform } = setup();
    let foundCallback: ((...args: unknown[]) => void) | undefined;

    (platform.onTabEvent as ReturnType<typeof vi.fn>).mockImplementation((_tabId, event, cb) => {
      if (event === "found-in-page") foundCallback = cb;
      return () => {};
    });

    const result = vi.fn();
    events.on(FIND_RESULT, result);

    await commands.send(FIND_NEXT, { text: "test" });

    foundCallback?.({}, { activeMatchOrdinal: 1, matches: 3, finalUpdate: false });

    expect(result).not.toHaveBeenCalled();
  });
});

describe("find:previous", () => {
  it("calls findInPage with forward:false", async () => {
    const { commands, platform } = setup();

    await commands.send(FIND_PREVIOUS, { text: "hello" });

    expect(platform.findInPage).toHaveBeenCalledWith(TAB_ID, "hello", {
      forward: false,
      findNext: true,
    });
  });
});

describe("keyboard shortcuts", () => {
  it("registers Ctrl+F as both global and local shortcut", () => {
    const { platform } = setup();
    expect(platform.registerShortcut).toHaveBeenCalledWith(
      "CommandOrControl+F",
      expect.any(Function),
    );
    expect(platform.registerLocalShortcut).toHaveBeenCalledWith(
      "CommandOrControl+F",
      expect.any(Function),
    );
  });

  it("registers F3 as both global and local shortcut", () => {
    const { platform } = setup();
    expect(platform.registerShortcut).toHaveBeenCalledWith("F3", expect.any(Function));
    expect(platform.registerLocalShortcut).toHaveBeenCalledWith("F3", expect.any(Function));
  });
});

describe("tab lifecycle", () => {
  it("stops find when another tab is activated", async () => {
    const { commands, events, platform } = setup();
    const stopped = vi.fn();
    events.on(FIND_STOPPED, stopped);

    await commands.send(FIND_START, undefined);
    events.emit(TABS_ACTIVATED, { tabId: "tab-2" as TabId, previousTabId: TAB_ID });

    // Allow async command to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(platform.stopFindInPage).toHaveBeenCalledWith(TAB_ID);
    expect(stopped).toHaveBeenCalled();
  });

  it("does not stop find on tab activation if find not active", async () => {
    const { events, platform } = setup();
    const stopped = vi.fn();
    events.on(FIND_STOPPED, stopped);

    events.emit(TABS_ACTIVATED, { tabId: "tab-2" as TabId, previousTabId: TAB_ID });

    await new Promise((r) => setTimeout(r, 0));

    expect(platform.stopFindInPage).not.toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
  });

  it("stops find when tab is closed", async () => {
    const { commands, events } = setup();
    const stopped = vi.fn();
    events.on(FIND_STOPPED, stopped);

    await commands.send(FIND_START, undefined);
    events.emit(TABS_CLOSED, { tabId: TAB_ID, activatedTabId: null });

    expect(stopped).toHaveBeenCalled();
  });

  it("cleans up found-in-page listener on tab close", async () => {
    const { commands, events, platform } = setup();
    const cleanup = vi.fn();
    (platform.onTabEvent as ReturnType<typeof vi.fn>).mockReturnValue(cleanup);

    await commands.send(FIND_NEXT, { text: "test" });
    events.emit(TABS_CLOSED, { tabId: TAB_ID, activatedTabId: null });

    expect(cleanup).toHaveBeenCalled();
  });
});
