import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import type { FolderId } from "../../shared/types";
import {
  FOLDERS_CHANGED,
  FOLDERS_RENAME_REQUESTED,
  type Folder,
  type FoldersEvents,
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
  const on = typedOnEvent<FoldersEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(FOLDERS_CHANGED, ({ folders }) => {
      const next = new Map<FolderId, Folder>();
      for (const folder of folders) {
        next.set(folder.id, folder);
      }
      useFoldersStore.setState({ folders: next });
    }),
  );

  unsubs.push(
    on(FOLDERS_RENAME_REQUESTED, ({ folderId }) => {
      useFoldersStore.setState({ renamingFolderId: folderId });
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
