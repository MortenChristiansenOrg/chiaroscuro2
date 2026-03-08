import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { WorkspaceId } from "../../shared/types";
import {
  WORKSPACES_CREATED,
  WORKSPACES_DELETED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_SWITCHED,
  WORKSPACES_UPDATED,
  type Workspace,
  type WorkspacesEvents,
} from "./workspaces.shared";

interface WorkspacesState {
  workspaces: Workspace[];
  activeWorkspaceId: WorkspaceId | null;
}

export const useWorkspacesStore = create<WorkspacesState>()(() => ({
  workspaces: [],
  activeWorkspaceId: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const on = typedOnEvent<WorkspacesEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(WORKSPACES_SWITCHED, ({ workspaceId }) => {
      useWorkspacesStore.setState({ activeWorkspaceId: workspaceId });
    }),
  );

  unsubs.push(
    on(WORKSPACES_CREATED, ({ workspace }) => {
      useWorkspacesStore.setState((state) => ({
        workspaces: [...state.workspaces, workspace],
        // Auto-set first workspace as active
        activeWorkspaceId: state.activeWorkspaceId ?? workspace.id,
      }));
    }),
  );

  unsubs.push(
    on(WORKSPACES_UPDATED, ({ workspace }) => {
      useWorkspacesStore.setState((state) => ({
        workspaces: state.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
      }));
    }),
  );

  unsubs.push(
    on(WORKSPACES_DELETED, ({ workspaceId }) => {
      useWorkspacesStore.setState((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
      }));
    }),
  );

  unsubs.push(
    on(WORKSPACES_LIST_CHANGED, ({ workspaces }) => {
      useWorkspacesStore.setState((state) => ({
        workspaces,
        activeWorkspaceId:
          state.activeWorkspaceId && workspaces.some((w) => w.id === state.activeWorkspaceId)
            ? state.activeWorkspaceId
            : (workspaces[0]?.id ?? null),
      }));
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
