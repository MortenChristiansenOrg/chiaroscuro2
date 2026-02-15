import type { Tab } from "@features/tabs/tabs.shared";
import type { Workspace } from "@features/workspaces/workspaces.shared";
import type { TabId, WorkspaceId } from "../../../src/shared/types";

export const tabId = (s: string) => s as TabId;
export const workspaceId = (s: string) => s as WorkspaceId;

const WS_WORK = workspaceId("ws-work");
const WS_PERSONAL = workspaceId("ws-personal");

export const DEMO_TABS: Tab[] = [
  {
    id: tabId("tab-github"),
    workspaceId: WS_WORK,
    url: "https://github.com",
    title: "GitHub",
    favicon: "",
    loading: false,
    bookmarked: true,
    lastAccessedAt: Date.now(),
    order: 0,
  },
  {
    id: tabId("tab-figma"),
    workspaceId: WS_WORK,
    url: "https://figma.com/design/project-x",
    title: "Figma — Project X",
    favicon: "",
    loading: false,
    bookmarked: true,
    lastAccessedAt: Date.now() - 60_000,
    order: 1,
  },
  {
    id: tabId("tab-reddit"),
    workspaceId: WS_WORK,
    url: "https://reddit.com/r/webdev",
    title: "Reddit — r/webdev",
    favicon: "",
    loading: false,
    bookmarked: false,
    lastAccessedAt: Date.now() - 120_000,
    order: 2,
  },
];

export const DEMO_WORKSPACES: Workspace[] = [
  {
    id: WS_WORK,
    name: "Work",
    color: "oklch(0.65 0.15 230)",
    icon: "W",
    activeTabId: tabId("tab-github"),
  },
  {
    id: WS_PERSONAL,
    name: "Personal",
    color: "oklch(0.65 0.15 350)",
    icon: "P",
    activeTabId: null,
  },
];

export function makeDemoTabMap(): Map<TabId, Tab> {
  const map = new Map<TabId, Tab>();
  for (const tab of DEMO_TABS) {
    map.set(tab.id, tab);
  }
  return map;
}
