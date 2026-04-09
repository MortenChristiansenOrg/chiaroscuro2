import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { TabsActivatedEvent, TabsClosedEvent } from "../tabs/tabs.shared";
import pip from "./pip.main";
import {
  PIP_ACTIVATED,
  PIP_CLOSE,
  PIP_DEACTIVATED,
  PIP_PLAY_STATE_CHANGED,
  PIP_RETURN_TO_TAB,
  PIP_TOGGLE_PLAY,
  type PipCommands,
  type PipEvents,
} from "./pip.shared";

type AllCommands = PipCommands & {
  "tabs:activate": { payload: { tabId: TabId }; response: undefined };
};
type AllEvents = PipEvents & {
  "tabs:activated": TabsActivatedEvent;
  "tabs:closed": TabsClosedEvent;
};

/** Flush microtask queue so async handlers (executeJavaScript) resolve. */
const flush = () => new Promise((r) => setTimeout(r, 10));

const TAB_A = "tab-a" as TabId;
const TAB_B = "tab-b" as TabId;

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();

  const platform = createMockPlatform({
    executeJavaScript: vi.fn(async () => false),
  });

  let activeTabId: TabId = TAB_B;

  pip.register({
    commands,
    events,
    platform,
    getActiveTabId: () => activeTabId,
  });

  commands.handle("tabs:activate", async (payload) => {
    const previous = activeTabId;
    activeTabId = payload.tabId;
    events.emit("tabs:activated", { tabId: payload.tabId, previousTabId: previous });
  });

  return { commands, events, platform };
}

/** Helper: set up PiP state by emitting a tab switch with video detected. */
async function activatePip(ctx: ReturnType<typeof setup>) {
  // First call: detect video → true. Second call: enter PiP → true.
  (ctx.platform.executeJavaScript as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(true) // DETECT_VIDEO_JS
    .mockResolvedValueOnce(true); // ENTER_PIP_JS

  ctx.events.emit("tabs:activated", { tabId: TAB_B, previousTabId: TAB_A });
  await flush();
}

describe("pip feature", () => {
  describe("automatic activation", () => {
    it("enters native PiP when switching away from a tab with playing video", async () => {
      const { events, platform } = setup();

      (platform.executeJavaScript as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(true) // detect
        .mockResolvedValueOnce(true); // enter

      const activated = vi.fn();
      events.on(PIP_ACTIVATED, activated);

      events.emit("tabs:activated", { tabId: TAB_B, previousTabId: TAB_A });
      await flush();

      // Should have called detect + enter PiP JS
      expect(platform.executeJavaScript).toHaveBeenCalledTimes(2);
      expect(activated).toHaveBeenCalledWith({ tabId: TAB_A });
    });

    it("does not activate PiP when no video is playing", async () => {
      const { events, platform } = setup();
      (platform.executeJavaScript as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const activated = vi.fn();
      events.on(PIP_ACTIVATED, activated);

      events.emit("tabs:activated", { tabId: TAB_B, previousTabId: TAB_A });
      await flush();

      expect(activated).not.toHaveBeenCalled();
    });

    it("does not activate PiP when there is no previous tab", async () => {
      const { events, platform } = setup();

      events.emit("tabs:activated", { tabId: TAB_B, previousTabId: null });
      await flush();

      expect(platform.executeJavaScript).not.toHaveBeenCalled();
    });
  });

  describe("pip:close", () => {
    it("pauses video and exits native PiP", async () => {
      const ctx = setup();
      await activatePip(ctx);

      const deactivated = vi.fn();
      ctx.events.on(PIP_DEACTIVATED, deactivated);

      await ctx.commands.send(PIP_CLOSE, undefined);

      // Should have called pause + exit PiP
      expect(ctx.platform.executeJavaScript).toHaveBeenCalledWith(
        TAB_A,
        expect.stringContaining("pause"),
      );
      expect(deactivated).toHaveBeenCalled();
    });
  });

  describe("pip:toggle-play", () => {
    it("toggles from playing to paused", async () => {
      const ctx = setup();
      await activatePip(ctx);

      const playStateChanged = vi.fn();
      ctx.events.on(PIP_PLAY_STATE_CHANGED, playStateChanged);

      await ctx.commands.send(PIP_TOGGLE_PLAY, undefined);

      expect(ctx.platform.executeJavaScript).toHaveBeenCalledWith(
        TAB_A,
        expect.stringContaining("pause"),
      );
      expect(playStateChanged).toHaveBeenCalledWith({ playing: false });
    });

    it("toggles from paused to playing", async () => {
      const ctx = setup();
      await activatePip(ctx);

      // Pause first
      await ctx.commands.send(PIP_TOGGLE_PLAY, undefined);

      const playStateChanged = vi.fn();
      ctx.events.on(PIP_PLAY_STATE_CHANGED, playStateChanged);

      await ctx.commands.send(PIP_TOGGLE_PLAY, undefined);

      expect(ctx.platform.executeJavaScript).toHaveBeenCalledWith(
        TAB_A,
        expect.stringContaining("play"),
      );
      expect(playStateChanged).toHaveBeenCalledWith({ playing: true });
    });
  });

  describe("pip:return-to-tab", () => {
    it("exits PiP and activates the source tab", async () => {
      const ctx = setup();
      await activatePip(ctx);

      const deactivated = vi.fn();
      ctx.events.on(PIP_DEACTIVATED, deactivated);

      await ctx.commands.send(PIP_RETURN_TO_TAB, undefined);

      expect(ctx.platform.executeJavaScript).toHaveBeenCalledWith(
        TAB_A,
        expect.stringContaining("exitPictureInPicture"),
      );
      expect(deactivated).toHaveBeenCalled();
    });
  });

  describe("tab closed", () => {
    it("dismisses PiP when source tab is closed", async () => {
      const ctx = setup();
      await activatePip(ctx);

      const deactivated = vi.fn();
      ctx.events.on(PIP_DEACTIVATED, deactivated);

      ctx.events.emit("tabs:closed", { tabId: TAB_A, activatedTabId: TAB_B });

      expect(deactivated).toHaveBeenCalled();
    });

    it("does not dismiss PiP when a different tab is closed", async () => {
      const ctx = setup();
      await activatePip(ctx);

      const deactivated = vi.fn();
      ctx.events.on(PIP_DEACTIVATED, deactivated);

      ctx.events.emit("tabs:closed", { tabId: "tab-other" as TabId, activatedTabId: TAB_B });

      expect(deactivated).not.toHaveBeenCalled();
    });
  });

  describe("auto-dismiss on source tab reactivated", () => {
    it("exits PiP when the source tab becomes active again", async () => {
      const ctx = setup();
      await activatePip(ctx);

      const deactivated = vi.fn();
      ctx.events.on(PIP_DEACTIVATED, deactivated);

      ctx.events.emit("tabs:activated", { tabId: TAB_A, previousTabId: TAB_B });

      expect(ctx.platform.executeJavaScript).toHaveBeenCalledWith(
        TAB_A,
        expect.stringContaining("exitPictureInPicture"),
      );
      expect(deactivated).toHaveBeenCalled();
    });
  });
});
