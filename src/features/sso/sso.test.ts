import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import feature from "./sso.main";
import {
  SSO_CHANGED,
  SSO_GET,
  SSO_SAVE,
  type SsoCommands,
  type SsoEvents,
  type SsoSettings,
  type SsoState,
} from "./sso.shared";

function setup(opts?: { ssoBootState?: SsoSettings; isWindows?: boolean }) {
  const commands = new CommandBus<SsoCommands>();
  const events = new EventBus<SsoEvents>();
  const dataStore = new MemoryDataStore();

  const deps = {
    commands,
    events,
    dataStore,
    ssoBootState: opts?.ssoBootState ?? { windowsAuth: false, azureAd: false },
    isWindows: opts?.isWindows ?? true,
  };

  feature.register(deps);
  return { commands, events, dataStore, deps };
}

describe("sso commands", () => {
  describe("SSO_GET", () => {
    it("returns defaults before any save", async () => {
      const { commands } = setup();
      const state = await commands.send(SSO_GET, undefined);
      expect(state.settings).toEqual({ windowsAuth: false, azureAd: false });
      expect(state.bootState).toEqual({ windowsAuth: false, azureAd: false });
      expect(state.isWindows).toBe(true);
    });

    it("reflects boot state passed via deps", async () => {
      const { commands } = setup({
        ssoBootState: { windowsAuth: true, azureAd: false },
      });
      const state = await commands.send(SSO_GET, undefined);
      expect(state.bootState).toEqual({ windowsAuth: true, azureAd: false });
    });

    it("reflects isWindows from deps", async () => {
      const { commands } = setup({ isWindows: false });
      const state = await commands.send(SSO_GET, undefined);
      expect(state.isWindows).toBe(false);
    });
  });

  describe("SSO_SAVE", () => {
    it("updates settings and emits SSO_CHANGED", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(SSO_CHANGED, listener);

      await commands.send(SSO_SAVE, { windowsAuth: true, azureAd: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { windowsAuth: true, azureAd: true },
        }),
      );

      const state = await commands.send(SSO_GET, undefined);
      expect(state.settings).toEqual({ windowsAuth: true, azureAd: true });
    });

    it("persists to data store", async () => {
      const { commands, dataStore } = setup();
      await commands.send(SSO_SAVE, { windowsAuth: true, azureAd: false });

      const stored = await dataStore.getSetting<SsoSettings>("sso");
      expect(stored).toEqual({ windowsAuth: true, azureAd: false });
    });

    it("preserves boot state after save", async () => {
      const { commands } = setup({
        ssoBootState: { windowsAuth: false, azureAd: false },
      });

      await commands.send(SSO_SAVE, { windowsAuth: true, azureAd: true });
      const state = await commands.send(SSO_GET, undefined);

      expect(state.settings).toEqual({ windowsAuth: true, azureAd: true });
      expect(state.bootState).toEqual({ windowsAuth: false, azureAd: false });
    });
  });

  describe("feature.start()", () => {
    it("loads persisted settings and emits SSO_CHANGED", async () => {
      const { events, deps, dataStore } = setup();
      await dataStore.setSetting("sso", { windowsAuth: true, azureAd: true });

      const listener = vi.fn();
      events.on(SSO_CHANGED, listener);

      await feature.start?.(deps);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { windowsAuth: true, azureAd: true },
        }),
      );
    });

    it("uses defaults when no persisted settings", async () => {
      const { events, deps } = setup();
      const listener = vi.fn();
      events.on(SSO_CHANGED, listener);

      await feature.start?.(deps);

      const emitted = listener.mock.calls[0][0] as SsoState;
      expect(emitted.settings).toEqual({ windowsAuth: false, azureAd: false });
    });

    it("includes boot state in emitted event", async () => {
      const { events, deps } = setup({
        ssoBootState: { windowsAuth: true, azureAd: false },
      });
      const listener = vi.fn();
      events.on(SSO_CHANGED, listener);

      await feature.start?.(deps);

      const emitted = listener.mock.calls[0][0] as SsoState;
      expect(emitted.bootState).toEqual({ windowsAuth: true, azureAd: false });
    });
  });
});
