import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import { SingletonTab } from "../../shared/singleton-tab";
import type { TabId } from "../../shared/types";
import { DEFAULT_PROVIDERS, type SearchProvider } from "../command-palette/resolve-input";
import { TABS_CLOSED, type TabsCommands, type TabsEvents } from "../tabs/tabs.shared";
import {
  SETTINGS_CHANGED,
  SETTINGS_GET,
  SETTINGS_OPEN,
  SETTINGS_SAVE,
  type Settings,
  type SettingsCommands,
  type SettingsEvents,
} from "./settings.shared";

type AllCommands = SettingsCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = SettingsEvents & Pick<TabsEvents, typeof TABS_CLOSED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  dataStore: DataStore;
  getActiveTabId: () => TabId | undefined;
}

let currentSettings: Settings;

function isPdfBackend(value: unknown): value is Settings["pdfBackend"] {
  return value === "pdfjs" || value === "mupdf";
}

function getDefaultSettings(): Settings {
  return {
    searchProviders: [...DEFAULT_PROVIDERS],
    defaultSearchProviderId: "!g",
    debugServer: { enabled: false, port: 19400 },
    pdfBackend: "pdfjs",
  };
}

export default defineFeature<Deps>({
  register({ commands, events, dataStore }) {
    currentSettings = getDefaultSettings();

    const settingsTab = new SingletonTab({
      activate: (tabId) => commands.send("tabs:activate", { tabId }),
      create: (url) => commands.send("tabs:create", { url }),
    });

    events.on(TABS_CLOSED, (payload) => {
      settingsTab.onClose(payload.tabId);
    });

    commands.handle(SETTINGS_OPEN, async () => {
      await settingsTab.openOrActivate("app:settings");
    });

    commands.handle(SETTINGS_GET, async () => {
      return { ...currentSettings };
    });

    commands.handle(SETTINGS_SAVE, async (payload) => {
      const pdfBackend = isPdfBackend(payload.pdfBackend) ? payload.pdfBackend : "pdfjs";
      currentSettings = { ...payload, pdfBackend };
      events.emit(SETTINGS_CHANGED, { settings: { ...currentSettings } });
      await Promise.all([
        dataStore
          .setSetting("search-providers", payload.searchProviders)
          .catch(logError("settings", "persist search providers")),
        dataStore
          .setSetting("default-search-provider", payload.defaultSearchProviderId)
          .catch(logError("settings", "persist default provider")),
        dataStore
          .setSetting("debug-server", payload.debugServer)
          .catch(logError("settings", "persist debug server")),
        dataStore
          .setSetting("pdf-backend", pdfBackend)
          .catch(logError("settings", "persist pdf backend")),
      ]);
    });
  },

  async start({ events, dataStore }) {
    const providers = await dataStore.getSetting<SearchProvider[]>("search-providers");
    if (providers) {
      currentSettings.searchProviders = providers.map((p) =>
        p.id ? p : { ...p, id: crypto.randomUUID() },
      );
    }

    const defaultBang = await dataStore.getSetting<string>("default-search-provider");
    if (defaultBang) currentSettings.defaultSearchProviderId = defaultBang;

    const debugServer = await dataStore.getSetting<Settings["debugServer"]>("debug-server");
    if (debugServer) currentSettings.debugServer = debugServer;

    const pdfBackend = await dataStore.getSetting<unknown>("pdf-backend");
    if (isPdfBackend(pdfBackend)) currentSettings.pdfBackend = pdfBackend;

    events.emit(SETTINGS_CHANGED, { settings: { ...currentSettings } });
  },
});
