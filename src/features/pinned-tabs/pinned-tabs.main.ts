import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { featureState } from "../../shared/feature-state";
import { logError } from "../../shared/log";
import { PersistedMap } from "../../shared/persisted-map";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import {
  TABS_ACTIVATE,
  TABS_CLOSE,
  TABS_CLOSED,
  TABS_CREATE,
  TABS_GET,
  TABS_TOGGLE_BOOKMARK,
  TABS_UPDATED,
} from "../tabs/tabs.shared";
import {
  PINNED_TABS_ACTIVATE,
  PINNED_TABS_ACTIVE_CHANGED,
  PINNED_TABS_CHANGED,
  PINNED_TABS_IS_PINNED,
  PINNED_TABS_TOGGLE_PIN,
  type PersistedPinnedTab,
  type PinnedTab,
  type PinnedTabsCommands,
  type PinnedTabsEvents,
} from "./pinned-tabs.shared";

type AllCommands = PinnedTabsCommands & TabsCommands;
type AllEvents = PinnedTabsEvents & TabsEvents;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  setActiveTabId: (tabId: TabId | undefined) => void;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
  getCustomization: (tabId: TabId) => { fixedAddressDisabled: boolean } | undefined;
}

const _state = featureState<{
  pinnedTabs: PersistedMap<TabId, PinnedTab, PersistedPinnedTab>;
}>("pinned-tabs");

export function isPinned(tabId: TabId): boolean {
  return _state.initialized ? _state.get().pinnedTabs.has(tabId) : false;
}

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events, platform, dataStore, getActiveTabId, getCustomization } = deps;

    const pinnedTabs = new PersistedMap<TabId, PinnedTab, PersistedPinnedTab>(
      dataStore.collection("pinned-tabs"),
      {
        serialize: (_key, pt) => ({
          id: pt.id,
          url: pt.url,
          title: pt.title,
          favicon: pt.favicon,
          order: pt.order,
        }),
        deserialize: (pp) => [
          pp.id as TabId,
          {
            id: pp.id as TabId,
            url: pp.url,
            title: pp.title,
            favicon: pp.favicon,
            order: pp.order,
          },
        ],
        source: "pinned-tabs",
      },
    );
    _state.init({ pinnedTabs });

    function emitChanged(): void {
      const sorted = pinnedTabs.values().sort((a, b) => a.order - b.order);
      events.emit(PINNED_TABS_CHANGED, { pinnedTabs: sorted });
    }

    // Track tab updates to sync pinned tab data
    events.on(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      const pt = pinnedTabs.get(tab.id);
      if (!pt) return;
      const canUpdateUrl = getCustomization(tab.id)?.fixedAddressDisabled ?? false;
      const changed =
        pt.title !== tab.title ||
        pt.favicon !== tab.favicon ||
        (canUpdateUrl && pt.url !== tab.url);
      if (!changed) return;
      const updated: PinnedTab = {
        ...pt,
        title: tab.title,
        favicon: tab.favicon,
        url: canUpdateUrl ? tab.url : pt.url,
      };
      pinnedTabs.set(updated.id, updated);
      emitChanged();
    });

    // Clean up pinned tabs when the underlying tab is closed
    events.on(TABS_CLOSED, (payload) => {
      const { tabId } = payload;
      if (pinnedTabs.has(tabId)) {
        pinnedTabs.delete(tabId);
        emitChanged();
      }
    });

    commands.handle(PINNED_TABS_TOGGLE_PIN, async (payload) => {
      const tabId = payload?.tabId ?? getActiveTabId();
      if (!tabId) return;

      if (pinnedTabs.has(tabId)) {
        // Unpin
        pinnedTabs.delete(tabId);
        emitChanged();
      } else {
        // Pin — ensure the tab is bookmarked before pinning so it can never be ephemeral
        const tab = await commands.send(TABS_GET, { tabId });
        if (!tab) return;
        if (!tab.bookmarked) {
          await commands.send(TABS_TOGGLE_BOOKMARK, { tabId });
        }

        const url = platform.getTabUrl(tabId) ?? "";
        const title = platform.getTabTitle(tabId) ?? url;
        const pt: PinnedTab = {
          id: tabId,
          url,
          title,
          favicon: "",
          order: pinnedTabs.size,
        };
        pinnedTabs.set(tabId, pt);
        emitChanged();
      }
    });

    commands.handle(PINNED_TABS_ACTIVATE, async (payload) => {
      const { tabId } = payload;
      if (!pinnedTabs.has(tabId)) return;

      await commands.send(TABS_ACTIVATE, { tabId });
      events.emit(PINNED_TABS_ACTIVE_CHANGED, { tabId });
    });

    platform.registerShortcut("CommandOrControl+P", () => {
      commands
        .send(PINNED_TABS_TOGGLE_PIN, {})
        .catch(logError("pinned-tabs", "toggle pin shortcut"));
    });

    commands.handle(PINNED_TABS_IS_PINNED, (payload) => pinnedTabs.has(payload.tabId));
  },

  teardown() {
    _state.reset();
  },
});

export async function start(deps: Deps): Promise<void> {
  const { pinnedTabs } = _state.get();
  await pinnedTabs.load({ sort: [{ field: "order", direction: "asc" }] });

  // Ensure all pinned tabs are bookmarked (migration for pre-existing pinned-but-ephemeral tabs)
  for (const pt of pinnedTabs.values()) {
    const tab = await deps.commands.send(TABS_GET, { tabId: pt.id });
    if (tab && !tab.bookmarked) {
      await deps.commands.send(TABS_TOGGLE_BOOKMARK, { tabId: pt.id });
    }
  }

  if (pinnedTabs.size > 0) {
    deps.events.emit(PINNED_TABS_CHANGED, {
      pinnedTabs: pinnedTabs.values().sort((a, b) => a.order - b.order),
    });
  }
}
