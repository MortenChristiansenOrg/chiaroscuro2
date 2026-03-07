import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import { getCustomization } from "../tab-customization/tab-customization.main";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import {
  TABS_ACTIVATE,
  TABS_CLOSE,
  TABS_CLOSED,
  TABS_CREATE,
  TABS_UPDATED,
} from "../tabs/tabs.shared";
import {
  PINNED_TABS_ACTIVATE,
  PINNED_TABS_ACTIVE_CHANGED,
  PINNED_TABS_CHANGED,
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
}

const _pinnedTabs = new Map<TabId, PinnedTab>();

export function isPinned(tabId: TabId): boolean {
  return _pinnedTabs.has(tabId);
}

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events, platform, dataStore, getActiveTabId } = deps;

    const pinnedCollection: Collection<PersistedPinnedTab> = dataStore.collection("pinned-tabs");
    _pinnedTabs.clear();

    function emitChanged(): void {
      const sorted = [..._pinnedTabs.values()].sort((a, b) => a.order - b.order);
      events.emit(PINNED_TABS_CHANGED, { pinnedTabs: sorted });
    }

    function persistPinnedTab(pt: PinnedTab): void {
      const persisted: PersistedPinnedTab = {
        id: pt.id,
        url: pt.url,
        title: pt.title,
        favicon: pt.favicon,
        order: pt.order,
      };
      pinnedCollection.update(pt.id, persisted).catch(() => {
        pinnedCollection.insert(persisted).catch(console.error);
      });
    }

    // Track tab updates to sync pinned tab data
    events.on(TABS_UPDATED, (payload) => {
      const { tab } = payload;
      const pt = _pinnedTabs.get(tab.id);
      if (!pt) return;
      const canUpdateUrl = getCustomization(tab.id)?.fixedAddressDisabled ?? false;
      if (canUpdateUrl) {
        pt.url = tab.url;
      }
      pt.title = tab.title;
      pt.favicon = tab.favicon;
      persistPinnedTab(pt);
    });

    // Clean up pinned tabs when the underlying tab is closed
    events.on(TABS_CLOSED, (payload) => {
      const { tabId } = payload;
      if (_pinnedTabs.has(tabId)) {
        _pinnedTabs.delete(tabId);
        pinnedCollection.remove(tabId).catch(() => {});
        emitChanged();
      }
    });

    commands.handle(PINNED_TABS_TOGGLE_PIN, async (payload) => {
      const tabId = payload?.tabId ?? getActiveTabId();
      if (!tabId) return;

      if (_pinnedTabs.has(tabId)) {
        // Unpin
        _pinnedTabs.delete(tabId);
        pinnedCollection.remove(tabId).catch(() => {});
        emitChanged();
      } else {
        // Pin — get current tab data from platform
        const url = platform.getTabUrl(tabId) ?? "";
        const title = platform.getTabTitle(tabId) ?? url;
        const pt: PinnedTab = {
          id: tabId,
          url,
          title,
          favicon: "",
          order: _pinnedTabs.size,
        };
        _pinnedTabs.set(tabId, pt);
        persistPinnedTab(pt);
        emitChanged();
      }
    });

    commands.handle(PINNED_TABS_ACTIVATE, async (payload) => {
      const { tabId } = payload;
      if (!_pinnedTabs.has(tabId)) return;

      await commands.send(TABS_ACTIVATE, { tabId });
      events.emit(PINNED_TABS_ACTIVE_CHANGED, { tabId });
    });

    platform.registerShortcut("CommandOrControl+P", () => {
      commands.send(PINNED_TABS_TOGGLE_PIN, {}).catch(console.error);
    });
  },
});

export async function start(deps: Deps): Promise<void> {
  const { dataStore, events } = deps;
  const pinnedCollection: Collection<PersistedPinnedTab> = dataStore.collection("pinned-tabs");

  const persisted = await pinnedCollection.findMany({
    sort: [{ field: "order", direction: "asc" }],
  });

  for (const pp of persisted) {
    const pt: PinnedTab = {
      id: pp.id as TabId,
      url: pp.url,
      title: pp.title,
      favicon: pp.favicon,
      order: pp.order,
    };
    _pinnedTabs.set(pt.id, pt);
  }

  if (_pinnedTabs.size > 0) {
    events.emit(PINNED_TABS_CHANGED, {
      pinnedTabs: [..._pinnedTabs.values()].sort((a, b) => a.order - b.order),
    });
  }
}
