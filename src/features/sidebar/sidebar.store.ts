import { create } from "zustand";
import { TABS_LIST_CHANGED, type TabsListChangedEvent } from "../tabs/tabs.shared";
import { WORKSPACES_SWITCHED, type WorkspacesSwitchedEvent } from "../workspaces/workspaces.shared";
import { SIDEBAR_VISIBILITY_CHANGED, type SidebarVisibilityChangedPayload } from "./sidebar.shared";

interface SidebarState {
  visible: boolean;
  announcement: string;
}

export const useSidebarStore = create<SidebarState>()(() => ({
  visible: true,
  announcement: "",
}));

let lastTabCount = 0;

export function subscribeToEvents(
  onEvent: (name: string, callback: (payload: unknown) => void) => () => void,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    onEvent(SIDEBAR_VISIBILITY_CHANGED, (payload) => {
      const { visible } = payload as SidebarVisibilityChangedPayload;
      useSidebarStore.setState({ visible });
    }),
  );

  unsubs.push(
    onEvent(WORKSPACES_SWITCHED, (payload) => {
      const { workspaceName } = payload as WorkspacesSwitchedEvent;
      const count = lastTabCount;
      useSidebarStore.setState({
        announcement: `Switched to ${workspaceName}, ${count} tab${count !== 1 ? "s" : ""}`,
      });
    }),
  );

  unsubs.push(
    onEvent(TABS_LIST_CHANGED, (payload) => {
      const { tabs } = payload as TabsListChangedEvent;
      const count = tabs.length;
      if (lastTabCount > 0 && lastTabCount !== count) {
        useSidebarStore.setState({
          announcement: `${count} tab${count !== 1 ? "s" : ""}`,
        });
      }
      lastTabCount = count;
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
