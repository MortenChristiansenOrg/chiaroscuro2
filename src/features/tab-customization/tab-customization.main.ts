import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { featureState } from "../../shared/feature-state";
import { logError } from "../../shared/log";
import type { TabId } from "../../shared/types";
import type { Tab, TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import { TABS_ACTIVATE, TABS_CLOSED } from "../tabs/tabs.shared";
import {
  DEFAULT_NAVIGATION_BLOCK_RULE,
  type NavigationBlockRule,
  TAB_CUSTOMIZATION_CHANGED,
  TAB_CUSTOMIZATION_CLOSE,
  TAB_CUSTOMIZATION_CLOSED,
  TAB_CUSTOMIZATION_GET_STATE,
  TAB_CUSTOMIZATION_OPEN,
  TAB_CUSTOMIZATION_OPENED,
  TAB_CUSTOMIZATION_REMOVED,
  TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED,
  TAB_CUSTOMIZATION_SET_NAVIGATION,
  TAB_CUSTOMIZATION_SET_TITLE,
  type TabCustomization,
  type TabCustomizationCommands,
  type TabCustomizationEvents,
} from "./tab-customization.shared";

interface PersistedCustomization {
  id: string;
  title: string | null;
  fixedAddressDisabled: boolean;
  blockNavigate?: NavigationBlockRule;
  blockRedirect?: NavigationBlockRule;
  blockFrameNavigate?: NavigationBlockRule;
  blockNewTabs?: boolean;
  blockNewWindows?: boolean;
}

type AllCommands = TabCustomizationCommands & Pick<TabsCommands, typeof TABS_ACTIVATE>;
type AllEvents = TabCustomizationEvents & Pick<TabsEvents, typeof TABS_CLOSED>;

export interface TabCustomizationDeps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  dataStore: DataStore;
  platform: Platform;
  getTab: (tabId: TabId) => Tab | undefined;
  isPinned: (tabId: TabId) => boolean;
}

const DEFAULT_CUSTOMIZATION: TabCustomization = {
  title: null,
  fixedAddressDisabled: false,
  blockNavigate: { ...DEFAULT_NAVIGATION_BLOCK_RULE },
  blockRedirect: { ...DEFAULT_NAVIGATION_BLOCK_RULE },
  blockFrameNavigate: { ...DEFAULT_NAVIGATION_BLOCK_RULE },
  blockNewTabs: false,
  blockNewWindows: false,
};

let stopNavigationBlock: (() => void) | undefined;

const _state = featureState<{
  customizations: Map<TabId, TabCustomization>;
  collection: Collection<PersistedCustomization>;
}>("tab-customization");

function isDefault(c: TabCustomization): boolean {
  return (
    c.title === null &&
    !c.fixedAddressDisabled &&
    !c.blockNavigate.enabled &&
    !c.blockRedirect.enabled &&
    !c.blockFrameNavigate.enabled &&
    !c.blockNewTabs &&
    !c.blockNewWindows
  );
}

function shouldBlock(rule: NavigationBlockRule, targetUrl: string, currentUrl: string): boolean {
  if (!rule.enabled) return false;
  if (!rule.crossOriginOnly) return true;
  try {
    return new URL(targetUrl).host !== new URL(currentUrl).host;
  } catch {
    return false;
  }
}

function toPersistedCustomization(tabId: TabId, c: TabCustomization): PersistedCustomization {
  return {
    id: tabId,
    title: c.title,
    fixedAddressDisabled: c.fixedAddressDisabled,
    blockNavigate: c.blockNavigate,
    blockRedirect: c.blockRedirect,
    blockFrameNavigate: c.blockFrameNavigate,
    blockNewTabs: c.blockNewTabs,
    blockNewWindows: c.blockNewWindows,
  };
}

function saveOrRemove(
  tabId: TabId,
  current: TabCustomization,
  customizations: Map<TabId, TabCustomization>,
  coll: Collection<PersistedCustomization>,
  events: EventBus<AllEvents>,
) {
  if (isDefault(current)) {
    customizations.delete(tabId);
    coll.remove(tabId).catch(logError("tab-customization", "remove"));
  } else {
    customizations.set(tabId, current);
    coll
      .upsert(toPersistedCustomization(tabId, current))
      .catch(logError("tab-customization", "upsert"));
  }
  events.emit(TAB_CUSTOMIZATION_CHANGED, { tabId, customization: current });
}

export default defineFeature<TabCustomizationDeps>({
  register(deps) {
    const { commands, events, dataStore, platform, getTab, isPinned } = deps;
    const customizations = new Map<TabId, TabCustomization>();
    const coll = dataStore.collection<PersistedCustomization>("tab-customizations");
    _state.init({ customizations, collection: coll });

    // ── Navigation blocking callback ────────────────────────────────
    stopNavigationBlock = platform.onNavigationBlock((tabId, targetUrl, currentUrl, type) => {
      const c = customizations.get(tabId);
      if (!c) return false;

      switch (type) {
        case "navigate":
          return shouldBlock(c.blockNavigate, targetUrl, currentUrl);
        case "redirect":
          return shouldBlock(c.blockRedirect, targetUrl, currentUrl);
        case "frame-navigate":
          return shouldBlock(c.blockFrameNavigate, targetUrl, currentUrl);
        case "new-tab":
          return c.blockNewTabs;
        case "new-window":
          return c.blockNewWindows;
      }
    });

    // ── Clean up on tab close ──────────────────────────────────────
    events.on(TABS_CLOSED, (payload) => {
      const { tabId } = payload;
      if (customizations.has(tabId)) {
        customizations.delete(tabId);
        coll.remove(tabId).catch(logError("tab-customization", "remove"));
        events.emit(TAB_CUSTOMIZATION_REMOVED, { tabId });
      }
    });

    // ── Commands ───────────────────────────────────────────────────

    commands.handle(TAB_CUSTOMIZATION_OPEN, async (payload) => {
      const { tabId } = payload;
      const tab = getTab(tabId);
      if (!tab) throw new Error(`Tab not found: ${tabId}`);
      if (tab.builtIn) throw new Error("Cannot customize built-in tabs");
      if (!tab.bookmarked && !isPinned(tabId)) throw new Error("Cannot customize ephemeral tabs");
      await commands.send(TABS_ACTIVATE, { tabId });
      events.emit(TAB_CUSTOMIZATION_OPENED, { tabId });
    });

    commands.handle(TAB_CUSTOMIZATION_CLOSE, async (payload) => {
      events.emit(TAB_CUSTOMIZATION_CLOSED, { tabId: payload.tabId });
    });

    commands.handle(TAB_CUSTOMIZATION_SET_TITLE, async (payload) => {
      const { tabId, title } = payload;
      const current = { ...(customizations.get(tabId) ?? DEFAULT_CUSTOMIZATION), title };
      saveOrRemove(tabId, current, customizations, coll, events);
    });

    commands.handle(TAB_CUSTOMIZATION_SET_FIXED_ADDRESS_DISABLED, async (payload) => {
      const { tabId, disabled } = payload;
      const current = {
        ...(customizations.get(tabId) ?? DEFAULT_CUSTOMIZATION),
        fixedAddressDisabled: disabled,
      };
      saveOrRemove(tabId, current, customizations, coll, events);
    });

    commands.handle(TAB_CUSTOMIZATION_SET_NAVIGATION, async (payload) => {
      const { tabId, ...navSettings } = payload;
      const current = {
        ...(customizations.get(tabId) ?? DEFAULT_CUSTOMIZATION),
        ...navSettings,
      };
      saveOrRemove(tabId, current, customizations, coll, events);
    });

    commands.handle(TAB_CUSTOMIZATION_GET_STATE, async (payload) => {
      return customizations.get(payload.tabId) ?? { ...DEFAULT_CUSTOMIZATION };
    });
  },

  teardown() {
    if (stopNavigationBlock) {
      stopNavigationBlock();
      stopNavigationBlock = undefined;
    }
    _state.reset();
  },
});

export async function start(deps: TabCustomizationDeps): Promise<void> {
  const { customizations, collection } = _state.get();
  const persisted = await collection.findMany({});
  for (const doc of persisted) {
    const tabId = doc.id as TabId;
    const customization: TabCustomization = {
      title: doc.title,
      fixedAddressDisabled: doc.fixedAddressDisabled,
      blockNavigate: doc.blockNavigate ?? { ...DEFAULT_NAVIGATION_BLOCK_RULE },
      blockRedirect: doc.blockRedirect ?? { ...DEFAULT_NAVIGATION_BLOCK_RULE },
      blockFrameNavigate: doc.blockFrameNavigate ?? { ...DEFAULT_NAVIGATION_BLOCK_RULE },
      blockNewTabs: doc.blockNewTabs ?? false,
      blockNewWindows: doc.blockNewWindows ?? false,
    };
    customizations.set(tabId, customization);
    deps.events.emit(TAB_CUSTOMIZATION_CHANGED, { tabId, customization });
  }
}

/** Read-only accessor for cross-feature queries (e.g. sidebar custom title). */
export function getCustomization(tabId: TabId): TabCustomization | undefined {
  return _state.initialized ? _state.get().customizations.get(tabId) : undefined;
}
