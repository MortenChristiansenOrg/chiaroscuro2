import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import {
  SSO_CHANGED,
  SSO_GET,
  SSO_SAVE,
  type SsoCommands,
  type SsoEvents,
  type SsoSettings,
  type SsoState,
} from "./sso.shared";

interface Deps {
  commands: CommandBus<SsoCommands>;
  events: EventBus<SsoEvents>;
  dataStore: DataStore;
  ssoBootState: SsoSettings;
  isWindows: boolean;
}

const DEFAULT_SSO: SsoSettings = { windowsAuth: false, azureAd: false };

let state: SsoState;

export default defineFeature<Deps>({
  register({ commands, events, dataStore, ssoBootState, isWindows }) {
    state = {
      settings: { ...DEFAULT_SSO },
      bootState: ssoBootState,
      isWindows,
    };

    commands.handle(SSO_GET, async () => ({ ...state, settings: { ...state.settings } }));

    commands.handle(SSO_SAVE, async (payload) => {
      state = { ...state, settings: { ...payload } };
      events.emit(SSO_CHANGED, { ...state, settings: { ...state.settings } });
      await dataStore.setSetting("sso", payload).catch(logError("sso", "persist sso settings"));
    });
  },

  async start({ events, dataStore }) {
    const persisted = await dataStore.getSetting<SsoSettings>("sso");
    if (persisted) {
      state = { ...state, settings: { ...persisted } };
    }
    events.emit(SSO_CHANGED, { ...state, settings: { ...state.settings } });
  },
});
