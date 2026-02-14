import { create } from "zustand";
import {
  WORKSPACES_CREATED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_SWITCHED,
} from "./workspaces.shared";
export const useWorkspacesStore = create()(() => ({
  workspaces: [],
  activeWorkspaceId: null,
}));
export function subscribeToEvents(onEvent) {
  const unsubs = [];
  unsubs.push(
    onEvent(WORKSPACES_SWITCHED, (payload) => {
      const { workspaceId } = payload;
      useWorkspacesStore.setState({ activeWorkspaceId: workspaceId });
    }),
  );
  unsubs.push(
    onEvent(WORKSPACES_CREATED, (payload) => {
      const { workspace } = payload;
      useWorkspacesStore.setState((state) => ({
        workspaces: [...state.workspaces, workspace],
        // Auto-set first workspace as active
        activeWorkspaceId: state.activeWorkspaceId ?? workspace.id,
      }));
    }),
  );
  unsubs.push(
    onEvent(WORKSPACES_LIST_CHANGED, (payload) => {
      const { workspaces } = payload;
      useWorkspacesStore.setState({ workspaces });
    }),
  );
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
