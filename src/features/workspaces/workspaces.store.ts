import { create } from "zustand";
import type { WorkspaceId } from "../../shared/types";
import {
  WORKSPACES_CREATED,
  WORKSPACES_DELETED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_SWITCHED,
  WORKSPACES_UPDATED,
  type Workspace,
  type WorkspacesCreatedEvent,
  type WorkspacesDeletedEvent,
  type WorkspacesListChangedEvent,
  type WorkspacesSwitchedEvent,
  type WorkspacesUpdatedEvent,
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
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(WORKSPACES_SWITCHED, (payload) => {
      const { workspaceId } = payload as WorkspacesSwitchedEvent;
      useWorkspacesStore.setState({ activeWorkspaceId: workspaceId });
    }),
  );

  unsubs.push(
    onEvent(WORKSPACES_CREATED, (payload) => {
      const { workspace } = payload as WorkspacesCreatedEvent;
      useWorkspacesStore.setState((state) => ({
        workspaces: [...state.workspaces, workspace],
        // Auto-set first workspace as active
        activeWorkspaceId: state.activeWorkspaceId ?? workspace.id,
      }));
    }),
  );

  unsubs.push(
    onEvent(WORKSPACES_UPDATED, (payload) => {
      const { workspace } = payload as WorkspacesUpdatedEvent;
      useWorkspacesStore.setState((state) => ({
        workspaces: state.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
      }));
    }),
  );

  unsubs.push(
    onEvent(WORKSPACES_DELETED, (payload) => {
      const { workspaceId } = payload as WorkspacesDeletedEvent;
      useWorkspacesStore.setState((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
      }));
    }),
  );

  unsubs.push(
    onEvent(WORKSPACES_LIST_CHANGED, (payload) => {
      const { workspaces } = payload as WorkspacesListChangedEvent;
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
