import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type {
  GlobalPermissions,
  PermissionDecision,
  PermissionsEvents,
} from "./permissions.shared";
import {
  PERMISSION_INFO,
  PERMISSIONS_CHANGED,
  PERMISSIONS_GET_GLOBAL,
  PERMISSIONS_GLOBAL_CHANGED,
} from "./permissions.shared";

interface PermissionsStoreState {
  globalPermissions: Record<string, PermissionDecision>;
  availablePermissions: string[];
  globalLoaded: boolean;
  domainPermissions: Map<string, Record<string, PermissionDecision>>;
}

export const usePermissionsStore = create<PermissionsStoreState>()(() => ({
  domainPermissions: new Map(),
  globalPermissions: {},
  availablePermissions: Object.keys(PERMISSION_INFO),
  globalLoaded: false,
}));

export async function loadGlobalPermissions(): Promise<void> {
  const before = usePermissionsStore.getState().globalPermissions;
  const result = (await window.chiaroscuro.sendCommand(PERMISSIONS_GET_GLOBAL, {})) as
    | GlobalPermissions
    | undefined;
  // A newer event may arrive while the initial snapshot is in flight.
  if (result && usePermissionsStore.getState().globalPermissions === before) {
    usePermissionsStore.setState({
      globalPermissions: result.permissions,
      availablePermissions: result.availablePermissions,
      globalLoaded: true,
    });
  }
}

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<PermissionsEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(PERMISSIONS_GLOBAL_CHANGED, ({ permissions, availablePermissions }) => {
      usePermissionsStore.setState({
        globalPermissions: permissions,
        availablePermissions,
        globalLoaded: true,
      });
    }),
  );

  unsubs.push(
    on(PERMISSIONS_CHANGED, ({ domain, permissions }) => {
      usePermissionsStore.setState((prev) => {
        const next = new Map(prev.domainPermissions);
        if (Object.keys(permissions).length === 0) {
          next.delete(domain);
        } else {
          next.set(domain, permissions);
        }
        return { domainPermissions: next };
      });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
