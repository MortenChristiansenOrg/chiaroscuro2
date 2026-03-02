import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { TabId } from "../../shared/types";
import { DEFAULT_PROVIDERS, type SearchProvider } from "../command-palette/resolve-input";
import {
  TABS_CLOSED,
  type TabsClosedEvent,
  type TabsCommands,
  type TabsEvents,
} from "../tabs/tabs.shared";
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

let settingsTabId: TabId | undefined;
let currentSettings: Settings;

function getDefaultSettings(): Settings {
  return {
    searchProviders: [...DEFAULT_PROVIDERS],
    defaultSearchProviderId: "!g",
  };
}

export function register({ commands, events, dataStore }: Deps): void {
  settingsTabId = undefined;
  currentSettings = getDefaultSettings();

  // Clear singleton tracking when settings tab is closed
  events.on(TABS_CLOSED, (payload) => {
    const { tabId } = payload as TabsClosedEvent;
    if (settingsTabId === tabId) settingsTabId = undefined;
  });

  commands.handle(SETTINGS_OPEN, async () => {
    // Singleton: reactivate if already open
    if (settingsTabId) {
      try {
        await commands.send("tabs:activate", { tabId: settingsTabId });
        return;
      } catch {
        // Tab was closed externally — fall through to create
        settingsTabId = undefined;
      }
    }
    settingsTabId = await commands.send("tabs:create", { url: "app:settings" });
  });

  commands.handle(SETTINGS_GET, async () => {
    return { ...currentSettings };
  });

  commands.handle(SETTINGS_SAVE, async (payload) => {
    currentSettings = { ...payload };
    events.emit(SETTINGS_CHANGED, { settings: { ...currentSettings } });
    dataStore.setSetting("search-providers", payload.searchProviders).catch(console.error);
    dataStore
      .setSetting("default-search-provider", payload.defaultSearchProviderId)
      .catch(console.error);
  });
}

export async function start({ events, dataStore }: Deps): Promise<void> {
  // Load persisted settings
  const providers = await dataStore.getSetting<SearchProvider[]>("search-providers");
  if (providers) currentSettings.searchProviders = providers;

  const defaultBang = await dataStore.getSetting<string>("default-search-provider");
  if (defaultBang) currentSettings.defaultSearchProviderId = defaultBang;

  events.emit(SETTINGS_CHANGED, { settings: { ...currentSettings } });
}
