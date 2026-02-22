import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { createMockPlatform } from "../../test-utils";
import { register, start } from "./sidebar.main";
import { SIDEBAR_TOGGLE, SIDEBAR_VISIBILITY_CHANGED } from "./sidebar.shared";
import type { SidebarCommands, SidebarEvents } from "./sidebar.shared";

function setup() {
  const commands = new CommandBus<SidebarCommands>();
  const events = new EventBus<SidebarEvents>();
  const platform = createMockPlatform();
  const deps = { commands, events, platform };
  register(deps);
  return { commands, events, platform, deps };
}

describe("sidebar commands", () => {
  it("SIDEBAR_TOGGLE toggles visible, emits VISIBILITY_CHANGED", async () => {
    const { commands, events } = setup();
    const listener = vi.fn();
    events.on(SIDEBAR_VISIBILITY_CHANGED, listener);

    await commands.send(SIDEBAR_TOGGLE, undefined);
    expect(listener).toHaveBeenCalledWith({ visible: false });

    await commands.send(SIDEBAR_TOGGLE, undefined);
    expect(listener).toHaveBeenCalledWith({ visible: true });
  });

  it("registers Ctrl+S shortcut", () => {
    const { platform } = setup();
    expect(platform.registerShortcut).toHaveBeenCalledWith(
      "CommandOrControl+S",
      expect.any(Function),
    );
  });
});

describe("start()", () => {
  it("emits initial visibility state", () => {
    const { events, deps } = setup();
    const listener = vi.fn();
    events.on(SIDEBAR_VISIBILITY_CHANGED, listener);

    start(deps);

    expect(listener).toHaveBeenCalledWith({ visible: true });
  });
});
