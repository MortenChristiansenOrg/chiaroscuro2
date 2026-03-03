import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId, WindowId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import { TABS_CLOSED, type TabsClosedEvent } from "../tabs/tabs.shared";
import { register } from "./dev-tools.main";
import {
  DEVTOOLS_TOGGLE,
  DEVTOOLS_TOGGLE_CHROME,
  type DevToolsCommands,
  type DevToolsEvents,
} from "./dev-tools.shared";

const TAB_ID = "tab-1" as TabId;
const WINDOW_ID = "win-1" as WindowId;

type AllEvents = DevToolsEvents & { [K in typeof TABS_CLOSED]: TabsClosedEvent };

function setup(opts: { isDev?: boolean; noActiveTab?: boolean } = {}) {
  const commands = new CommandBus<DevToolsCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform();

  register({
    commands,
    events,
    platform,
    isDev: opts.isDev ?? false,
    getActiveTabId: () => (opts.noActiveTab ? undefined : TAB_ID),
    getActiveWindowId: () => WINDOW_ID,
  });

  return { commands, events, platform };
}

describe("devtools:toggle", () => {
  it("opens devtools docked right when closed", async () => {
    const { commands, platform } = setup();
    vi.mocked(platform.isTabDevToolsOpened).mockReturnValue(false);

    await commands.send(DEVTOOLS_TOGGLE, undefined);

    expect(platform.openTabDevTools).toHaveBeenCalledWith(TAB_ID, "right");
  });

  it("closes devtools when already open", async () => {
    const { commands, platform } = setup();
    vi.mocked(platform.isTabDevToolsOpened).mockReturnValue(true);

    await commands.send(DEVTOOLS_TOGGLE, undefined);

    expect(platform.closeTabDevTools).toHaveBeenCalledWith(TAB_ID);
  });

  it("does nothing without active tab", async () => {
    const { commands, platform } = setup({ noActiveTab: true });

    await commands.send(DEVTOOLS_TOGGLE, undefined);

    expect(platform.isTabDevToolsOpened).not.toHaveBeenCalled();
    expect(platform.openTabDevTools).not.toHaveBeenCalled();
  });
});

describe("devtools:toggle-chrome", () => {
  it("toggles shell devtools in dev mode", async () => {
    const { commands, platform } = setup({ isDev: true });

    await commands.send(DEVTOOLS_TOGGLE_CHROME, undefined);

    expect(platform.toggleShellDevTools).toHaveBeenCalledWith(WINDOW_ID);
  });

  it("does nothing in production mode", async () => {
    const { commands, platform } = setup({ isDev: false });

    await commands.send(DEVTOOLS_TOGGLE_CHROME, undefined);

    expect(platform.toggleShellDevTools).not.toHaveBeenCalled();
  });
});

describe("keyboard shortcuts", () => {
  it("registers F12 as a local shortcut for devtools toggle", () => {
    const { platform } = setup();
    expect(platform.registerLocalShortcut).toHaveBeenCalledWith("F12", expect.any(Function));
  });

  it("registers F11 in dev mode", () => {
    const { platform } = setup({ isDev: true });
    expect(platform.registerShortcut).toHaveBeenCalledWith("F11", expect.any(Function));
  });

  it("does not register F11 in production mode", () => {
    const { platform } = setup({ isDev: false });
    const calls = vi.mocked(platform.registerShortcut).mock.calls;
    expect(calls.some(([key]) => key === "F11")).toBe(false);
  });
});

describe("tab lifecycle", () => {
  it("cleans up tracking on tab close", async () => {
    const { commands, events, platform } = setup();
    vi.mocked(platform.isTabDevToolsOpened).mockReturnValue(false);

    // Open devtools
    await commands.send(DEVTOOLS_TOGGLE, undefined);
    expect(platform.openTabDevTools).toHaveBeenCalled();

    // Close tab
    events.emit(TABS_CLOSED, { tabId: TAB_ID, activatedTabId: null });

    // No errors from cleanup (smoke test — tracking set is cleaned)
  });
});
