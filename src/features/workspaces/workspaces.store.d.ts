import type { WorkspaceId } from "../../shared/types";
import type { Workspace } from "./workspaces.shared";
interface WorkspacesState {
  workspaces: Workspace[];
  activeWorkspaceId: WorkspaceId | null;
}
export declare const useWorkspacesStore: import("zustand").UseBoundStore<
  import("zustand").StoreApi<WorkspacesState>
>;
export declare function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void;
