import { create } from "zustand";
import type { TabId } from "../../shared/types";
import {
  LOCAL_WEB_APP_CONFIG_CHANGED,
  LOCAL_WEB_APP_CONFIG_REMOVED,
  LOCAL_WEB_APP_STATUS_CHANGED,
  type LocalWebAppConfig,
  type LocalWebAppConfigChangedEvent,
  type LocalWebAppConfigRemovedEvent,
  type LocalWebAppStatus,
  type LocalWebAppStatusChangedEvent,
} from "./local-web-app.shared";

interface LocalWebAppState {
  configs: Map<TabId, LocalWebAppConfig>;
  statuses: Map<TabId, LocalWebAppStatus>;
}

export const useLocalWebAppStore = create<LocalWebAppState>()(() => ({
  configs: new Map(),
  statuses: new Map(),
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(LOCAL_WEB_APP_CONFIG_CHANGED, (payload) => {
      const { tabId, config } = payload as LocalWebAppConfigChangedEvent;
      useLocalWebAppStore.setState((s) => {
        const next = new Map(s.configs);
        next.set(tabId, config);
        return { configs: next };
      });
    }),
  );

  unsubs.push(
    onEvent(LOCAL_WEB_APP_CONFIG_REMOVED, (payload) => {
      const { tabId } = payload as LocalWebAppConfigRemovedEvent;
      useLocalWebAppStore.setState((s) => {
        const configs = new Map(s.configs);
        const statuses = new Map(s.statuses);
        configs.delete(tabId);
        statuses.delete(tabId);
        return { configs, statuses };
      });
    }),
  );

  unsubs.push(
    onEvent(LOCAL_WEB_APP_STATUS_CHANGED, (payload) => {
      const { tabId, status } = payload as LocalWebAppStatusChangedEvent;
      useLocalWebAppStore.setState((s) => {
        const next = new Map(s.statuses);
        next.set(tabId, status);
        return { statuses: next };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
