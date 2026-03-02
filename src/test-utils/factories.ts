import type { PinnedTab } from "../features/pinned-tabs/pinned-tabs.shared";
import type { Tab } from "../features/tabs/tabs.shared";
import type { Workspace } from "../features/workspaces/workspaces.shared";
import type { TabId, WorkspaceId } from "../shared/types";

export function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tab-1" as TabId,
    workspaceId: "ws-1" as WorkspaceId,
    url: "https://example.com",
    title: "Example",
    favicon: "",
    loading: false,
    bookmarked: true,
    lastAccessedAt: 0,
    createdAt: 0,
    order: 0,
    folderId: null,
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1" as WorkspaceId,
    name: "Work",
    color: "oklch(0.6 0.12 230)",
    icon: "W",
    activeTabId: null,
    ...overrides,
  };
}

export function makePinnedTab(overrides: Partial<PinnedTab> = {}): PinnedTab {
  return {
    id: "tab-1" as TabId,
    url: "https://example.com",
    title: "Example",
    favicon: "",
    order: 0,
    ...overrides,
  };
}
