import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { PermissionDecision, PermissionsEvents } from "./permissions.shared";
import { PERMISSIONS_CHANGED } from "./permissions.shared";

interface PermissionsStoreState {
  domainPermissions: Map<string, Record<string, PermissionDecision>>;
}

export const usePermissionsStore = create<PermissionsStoreState>()(() => ({
  domainPermissions: new Map(),
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<PermissionsEvents>(onEvent);
  const unsubs: (() => void)[] = [];

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
