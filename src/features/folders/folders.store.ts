import { create } from "zustand";
import type { FolderId } from "../../shared/types";
import {
  FOLDERS_CHANGED,
  FOLDERS_RENAME_REQUESTED,
  type Folder,
  type FoldersChangedEvent,
  type FoldersRenameRequestedEvent,
} from "./folders.shared";

interface FoldersState {
  folders: Map<FolderId, Folder>;
  renamingFolderId: FolderId | null;
}

export const useFoldersStore = create<FoldersState>()(() => ({
  folders: new Map(),
  renamingFolderId: null,
}));

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(FOLDERS_CHANGED, (payload) => {
      const { folders } = payload as FoldersChangedEvent;
      const next = new Map<FolderId, Folder>();
      for (const folder of folders) {
        next.set(folder.id, folder);
      }
      useFoldersStore.setState({ folders: next });
    }),
  );

  unsubs.push(
    onEvent(FOLDERS_RENAME_REQUESTED, (payload) => {
      const { folderId } = payload as FoldersRenameRequestedEvent;
      useFoldersStore.setState({ renamingFolderId: folderId });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
