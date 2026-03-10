import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { TabId } from "../../shared/types";
import {
  LOCAL_WEB_APP_CONFIG_CHANGED,
  LOCAL_WEB_APP_CONFIG_REMOVED,
  LOCAL_WEB_APP_STATUS_CHANGED,
  type LocalWebAppConfig,
  type LocalWebAppEvents,
  type LocalWebAppStatus,
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
  const on = typedOnEvent<LocalWebAppEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(LOCAL_WEB_APP_CONFIG_CHANGED, ({ tabId, config }) => {
      useLocalWebAppStore.setState((s) => {
        const next = new Map(s.configs);
        next.set(tabId, config);
        return { configs: next };
      });
    }),
  );

  unsubs.push(
    on(LOCAL_WEB_APP_CONFIG_REMOVED, ({ tabId }) => {
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
    on(LOCAL_WEB_APP_STATUS_CHANGED, ({ tabId, status }) => {
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
