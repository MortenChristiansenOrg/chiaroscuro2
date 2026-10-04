import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError, logWarn } from "../../shared/log";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import {
  DOMAIN_SCRIPTS_ACTIONS,
  DOMAIN_SCRIPTS_RUN,
  DOMAIN_SCRIPTS_RUN_ALIAS,
  type DomainScriptsCommands,
} from "../domain-scripts/domain-scripts.shared";
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
import { getBuiltInPages, type ProviderConfig, resolveInput } from "./resolve-input";
import { initVisitTracking, recordVisit, searchVisits } from "./suggestions";

type AllCommands = CommandPaletteCommands &
  Pick<TabsCommands, "tabs:create" | "tabs:navigate"> &
  Pick<
    DomainScriptsCommands,
    typeof DOMAIN_SCRIPTS_ACTIONS | typeof DOMAIN_SCRIPTS_RUN | typeof DOMAIN_SCRIPTS_RUN_ALIAS
  >;
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
  isPrivacyWorkspace: (workspaceId: WorkspaceId) => boolean;
}

export default defineFeature<Deps>({
  register({
    commands,
    events,
    platform,
    dataStore,
    getActiveWindowId,
    getActiveTabId,
    isPrivacyWorkspace,
  }) {
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

    // Track tab navigations for visit history (skip privacy-mode workspaces)
    events.on(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      if (
        !tab.builtIn &&
        !tab.loading &&
        tab.url &&
        tab.title &&
        !isPrivacyWorkspace(tab.workspaceId)
      ) {
        recordVisit(tab.url, tab.title).catch(logWarn("command-palette", "record visit"));
      }
    });

    commands.handle(COMMAND_PALETTE_SHOW, async () => {
      if (isOpen) return;
      isOpen = true;
      // Pass current provider config to the overlay
      if (providerConfig) {
        platform
          .updateCommandPalette(`providerConfig=${JSON.stringify(providerConfig)}`)
          .catch(() => {});
      }
      platform.showCommandPalette();
      events.emit(COMMAND_PALETTE_SHOWN, undefined);
    });

    commands.handle(COMMAND_PALETTE_HIDE, async () => {
      if (!isOpen) return;
      isOpen = false;
      platform.hideCommandPalette();
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
      if (payload.scriptId) {
        await commands.send(DOMAIN_SCRIPTS_RUN, { id: payload.scriptId });
        return;
      }
      if (payload.command.trim().startsWith("/") && commands.hasHandler(DOMAIN_SCRIPTS_RUN_ALIAS)) {
        const result = await commands.send(DOMAIN_SCRIPTS_RUN_ALIAS, {
          alias: payload.command.trim(),
        });
        if (result.handled) return;
      }
      const url = resolveInput(payload.command, providerConfig);
      if (!url) return;

      // Built-in pages always open via tabs:create (handles singleton + builtIn flag)
      if (url.startsWith("/")) {
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

      // The palette closes after successful execution and keeps failures visible.
      // Closing here could race with a subsequent re-open.
    });

    commands.handle(COMMAND_PALETTE_SEARCH_VISITS, async (payload) => {
      const q = payload.query;
      const visits = await searchVisits(q);
      const results: import("./command-palette.shared").Suggestion[] = visits.map((v) => ({
        url: v.url,
        title: v.title,
        visitCount: v.visitCount,
      }));

      const actions = commands.hasHandler(DOMAIN_SCRIPTS_ACTIONS)
        ? await commands.send(DOMAIN_SCRIPTS_ACTIONS, { query: q })
        : [];
      const scriptResults = actions.map((action) => ({
        title: action.name,
        url: action.alias || "Website action",
        visitCount: 0,
        scriptId: action.id,
      }));

      // Prepend matching built-in pages for `/` queries
      if (q.startsWith("/")) {
        const lower = q.toLowerCase();
        const pages = getBuiltInPages()
          .filter((p) => p.route.toLowerCase().startsWith(lower))
          .map((p) => ({ url: p.route, title: p.title, visitCount: 0 }));
        return [...pages, ...scriptResults, ...results];
      }

      return [...scriptResults, ...results];
    });

    platform.registerShortcut("CommandOrControl+T", () => {
      commands
        .send(COMMAND_PALETTE_TOGGLE, undefined)
        .catch(logError("command-palette", "shortcut toggle"));
    });
    platform.registerLocalShortcut("CommandOrControl+T", () => {
      commands
        .send(COMMAND_PALETTE_TOGGLE, undefined)
        .catch(logError("command-palette", "shortcut toggle"));
    });
  },
});
