import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId, WindowId } from "../../shared/types";
import type { SettingsChangedEvent, SettingsEvents } from "../settings/settings.shared";
import { SETTINGS_CHANGED } from "../settings/settings.shared";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import { TABS_UPDATED } from "../tabs/tabs.shared";
import {
  COMMAND_PALETTE_EXECUTE,
  COMMAND_PALETTE_HIDDEN,
  COMMAND_PALETTE_HIDE,
  COMMAND_PALETTE_SEARCH_VISITS,
  COMMAND_PALETTE_SHOW,
  COMMAND_PALETTE_SHOWN,
  COMMAND_PALETTE_TOGGLE,
  type CommandPaletteCommands,
  type CommandPaletteEvents,
} from "./command-palette.shared";
import { type ProviderConfig, resolveInput } from "./resolve-input";
import { initVisitTracking, recordVisit, searchVisits } from "./suggestions";

type AllCommands = CommandPaletteCommands &
  Pick<TabsCommands, "tabs:activate" | "tabs:create" | "tabs:navigate">;
type AllEvents = CommandPaletteEvents &
  Pick<TabsEvents, typeof TABS_UPDATED> &
  Pick<SettingsEvents, typeof SETTINGS_CHANGED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
}

export default defineFeature<Deps>({
  register({ commands, events, platform, dataStore, getActiveWindowId, getActiveTabId }) {
    let isOpen = false;
    let providerConfig: ProviderConfig | undefined;

    // Initialize visit tracking
    initVisitTracking(dataStore);

    // Cache provider config from settings events
    events.on(SETTINGS_CHANGED, (payload) => {
      const { settings } = payload as SettingsChangedEvent;
      providerConfig = {
        providers: settings.searchProviders,
        defaultBang: settings.defaultSearchProviderId,
      };
    });

    // Track tab navigations for visit history
    events.on(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      if (!tab.loading && tab.url && tab.title) {
        recordVisit(tab.url, tab.title).catch(() => {});
      }
    });

    commands.handle(COMMAND_PALETTE_SHOW, async () => {
      if (isOpen) return;
      isOpen = true;
      const tabId = getActiveTabId();
      if (tabId) platform.hideTab(tabId);
      const windowId = getActiveWindowId();
      if (windowId) platform.focusShell(windowId);
      events.emit(COMMAND_PALETTE_SHOWN, undefined);
    });

    commands.handle(COMMAND_PALETTE_HIDE, async () => {
      if (!isOpen) return;
      isOpen = false;
      // Re-show active tab by re-activating it (sets bounds)
      const tabId = getActiveTabId();
      if (tabId) {
        await commands.send("tabs:activate", { tabId });
      }
      events.emit(COMMAND_PALETTE_HIDDEN, undefined);
    });

    commands.handle(COMMAND_PALETTE_TOGGLE, async () => {
      if (isOpen) {
        await commands.send(COMMAND_PALETTE_HIDE, undefined);
      } else {
        await commands.send(COMMAND_PALETTE_SHOW, undefined);
      }
    });

    commands.handle(COMMAND_PALETTE_EXECUTE, async (payload) => {
      const url = resolveInput(payload.command, providerConfig);
      if (!url) return;

      // Built-in pages always open via tabs:create (handles singleton + builtIn flag)
      if (url.startsWith("app:")) {
        await commands.send("tabs:create", { url });
      } else if (payload.inCurrentTab) {
        const tabId = getActiveTabId();
        if (tabId) {
          await commands.send("tabs:navigate", { url });
        } else {
          await commands.send("tabs:create", { url });
        }
      } else {
        await commands.send("tabs:create", { url });
      }

      // Auto-hide palette after execution
      await commands.send(COMMAND_PALETTE_HIDE, undefined);
    });

    commands.handle(COMMAND_PALETTE_SEARCH_VISITS, async (payload) => {
      const visits = await searchVisits(payload.query);
      return visits.map((v) => ({
        url: v.url,
        title: v.title,
        visitCount: v.visitCount,
      }));
    });

    platform.registerShortcut("CommandOrControl+T", () => {
      commands.send(COMMAND_PALETTE_TOGGLE, undefined).catch(console.error);
    });
  },
});
