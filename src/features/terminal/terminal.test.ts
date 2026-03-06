import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { TabsEvents } from "../tabs/tabs.shared";
import { _reset, register, start } from "./terminal.main";
import {
  TERMINAL_CLEAR,
  TERMINAL_CLEARED,
  TERMINAL_OUTPUT,
  TERMINAL_TOGGLE,
  TERMINAL_VISIBILITY_CHANGED,
  TERMINAL_WRITE,
  type TerminalCommands,
  type TerminalEvents,
  type TerminalOutputEvent,
  type TerminalVisibilityChangedEvent,
} from "./terminal.shared";

type AllCommands = TerminalCommands;
type AllEvents = TerminalEvents & Pick<TabsEvents, "tabs:closed">;

function setup() {
  _reset();
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const platform = createMockPlatform();
  const activeTabId = { current: "tab-1" as TabId };

  const deps = {
    commands,
    events,
    platform,
    getActiveTabId: () => activeTabId.current as TabId | undefined,
  };

  register(deps);

  return { commands, events, platform, deps, activeTabId };
}

describe("terminal feature", () => {
  describe("toggle", () => {
    it("emits visibility-changed when toggled", async () => {
      const { commands, events } = setup();
      const handler = vi.fn();
      events.on(TERMINAL_VISIBILITY_CHANGED, handler);

      await commands.send(TERMINAL_TOGGLE, undefined);
      expect(handler).toHaveBeenCalledWith({ visible: true });

      await commands.send(TERMINAL_TOGGLE, undefined);
      expect(handler).toHaveBeenCalledWith({ visible: false });
    });
  });

  describe("write", () => {
    it("emits output event for each write", async () => {
      const { commands, events } = setup();
      const handler = vi.fn();
      events.on(TERMINAL_OUTPUT, handler);

      await commands.send(TERMINAL_WRITE, {
        tabId: "tab-1" as TabId,
        data: "hello world",
        type: "stdout",
      });

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-1",
        line: { text: "hello world", type: "stdout" },
      } satisfies TerminalOutputEvent);
    });

    it("strips ANSI escape codes from output", async () => {
      const { commands, events } = setup();
      const handler = vi.fn();
      events.on(TERMINAL_OUTPUT, handler);

      await commands.send(TERMINAL_WRITE, {
        tabId: "tab-1" as TabId,
        data: "\u001b[32m\u001b[1mVITE\u001b[22m v7.3.1\u001b[39m  ready",
        type: "stdout",
      });

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-1",
        line: { text: "VITE v7.3.1  ready", type: "stdout" },
      });
    });

    it("emits stderr output", async () => {
      const { commands, events } = setup();
      const handler = vi.fn();
      events.on(TERMINAL_OUTPUT, handler);

      await commands.send(TERMINAL_WRITE, {
        tabId: "tab-1" as TabId,
        data: "error!",
        type: "stderr",
      });

      expect(handler).toHaveBeenCalledWith({
        tabId: "tab-1",
        line: { text: "error!", type: "stderr" },
      });
    });
  });

  describe("clear", () => {
    it("emits cleared event for active tab", async () => {
      const { commands, events } = setup();
      const handler = vi.fn();
      events.on(TERMINAL_CLEARED, handler);

      // Write something first
      await commands.send(TERMINAL_WRITE, {
        tabId: "tab-1" as TabId,
        data: "test",
        type: "stdout",
      });

      await commands.send(TERMINAL_CLEAR, undefined);

      expect(handler).toHaveBeenCalledWith({ tabId: "tab-1" });
    });

    it("does nothing when no active tab", async () => {
      const { commands, events, activeTabId } = setup();
      activeTabId.current = undefined as unknown as TabId;
      const handler = vi.fn();
      events.on(TERMINAL_CLEARED, handler);

      await commands.send(TERMINAL_CLEAR, undefined);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("tab close cleanup", () => {
    it("cleans up buffer on tab close", async () => {
      const { commands, events } = setup();
      const outputHandler = vi.fn();
      events.on(TERMINAL_OUTPUT, outputHandler);

      // Write to tab
      await commands.send(TERMINAL_WRITE, {
        tabId: "tab-1" as TabId,
        data: "test",
        type: "stdout",
      });
      expect(outputHandler).toHaveBeenCalledTimes(1);

      // Close tab — buffer should be cleaned
      events.emit("tabs:closed", {
        tabId: "tab-1" as TabId,
        activatedTabId: null,
      });

      // Write again after close — should still work (new buffer)
      await commands.send(TERMINAL_WRITE, {
        tabId: "tab-1" as TabId,
        data: "new",
        type: "stdout",
      });
      expect(outputHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("start", () => {
    it("emits initial visibility state", () => {
      const { events, deps } = setup();
      const handler = vi.fn();
      events.on(TERMINAL_VISIBILITY_CHANGED, handler);

      start(deps);

      expect(handler).toHaveBeenCalledWith({ visible: false });
    });
  });

  describe("keyboard shortcut", () => {
    it("registers local shortcut for ½ key", () => {
      const { platform } = setup();
      expect(platform.registerLocalShortcut).toHaveBeenCalledWith("½", expect.any(Function));
    });
  });
});
