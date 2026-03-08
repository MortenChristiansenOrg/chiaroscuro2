import { create } from "zustand";
import { typedOnEvent } from "../../shared/typed-on-event";
import { TABS_LIST_CHANGED, type TabsEvents } from "../tabs/tabs.shared";
import { WORKSPACES_SWITCHED, type WorkspacesEvents } from "../workspaces/workspaces.shared";
import { SIDEBAR_VISIBILITY_CHANGED, type SidebarEvents } from "./sidebar.shared";

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
  const on = typedOnEvent<SidebarEvents & WorkspacesEvents & TabsEvents>(onEvent);
  const unsubs: (() => void)[] = [];

  unsubs.push(
    on(SIDEBAR_VISIBILITY_CHANGED, ({ visible }) => {
      useSidebarStore.setState({ visible });
    }),
  );

  unsubs.push(
    on(WORKSPACES_SWITCHED, ({ workspaceName }) => {
      const count = lastTabCount;
      useSidebarStore.setState({
        announcement: `Switched to ${workspaceName}, ${count} tab${count !== 1 ? "s" : ""}`,
      });
    }),
  );

  unsubs.push(
    on(TABS_LIST_CHANGED, ({ tabs }) => {
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
