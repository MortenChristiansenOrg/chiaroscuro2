import type { Download } from "@features/downloads/downloads.shared";
import type { Folder } from "@features/folders/folders.shared";
import type { PinnedTab } from "@features/pinned-tabs/pinned-tabs.shared";
import type { Tab } from "@features/tabs/tabs.shared";
import type { Workspace } from "@features/workspaces/workspaces.shared";
import type { FolderId, TabId, WorkspaceId } from "../../../src/shared/types";

export const tabId = (s: string) => s as TabId;
export const workspaceId = (s: string) => s as WorkspaceId;
export const folderId = (s: string) => s as FolderId;

const WS_WORK = workspaceId("ws-work");
const WS_PERSONAL = workspaceId("ws-personal");
const WS_RESEARCH = workspaceId("ws-research");
const WS_SOCIAL = workspaceId("ws-social");
const WS_MUSIC = workspaceId("ws-music");

const FOLDER_DEV = folderId("folder-dev");

export const DEMO_FOLDERS: Folder[] = [
  {
    id: FOLDER_DEV,
    workspaceId: WS_WORK,
    name: "Dev",
    parentFolderId: null,
    collapsed: false,
    order: 0,
  },
];

export function makeDemoFolderMap(): Map<FolderId, Folder> {
  const map = new Map<FolderId, Folder>();
  for (const folder of DEMO_FOLDERS) {
    map.set(folder.id, folder);
  }
  return map;
}

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
    createdAt: Date.now(),
    order: 0,
    folderId: FOLDER_DEV,
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
    createdAt: Date.now() - 60_000,
    order: 1,
    folderId: FOLDER_DEV,
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
    createdAt: Date.now() - 120_000,
    order: 2,
    folderId: null,
  },
];

export const DEMO_WORKSPACES: Workspace[] = [
  {
    id: WS_WORK,
    name: "Work",
    color: "oklch(0.65 0.15 230)",
    icon: "fa:briefcase",
    activeTabId: tabId("tab-github"),
  },
  {
    id: WS_PERSONAL,
    name: "Personal",
    color: "oklch(0.65 0.15 350)",
    icon: "P",
    activeTabId: null,
  },
  {
    id: WS_RESEARCH,
    name: "Research",
    color: "oklch(0.6 0.15 140)",
    icon: "fa:flask",
    activeTabId: null,
  },
  {
    id: WS_SOCIAL,
    name: "Social",
    color: "oklch(0.6 0.15 280)",
    icon: "fa:users",
    activeTabId: null,
  },
  {
    id: WS_MUSIC,
    name: "Music",
    color: "oklch(0.6 0.15 50)",
    icon: "fa:music",
    activeTabId: null,
  },
];

export const DEMO_PINNED_TABS: PinnedTab[] = [
  {
    id: tabId("pin-gmail"),
    url: "https://mail.google.com",
    title: "Gmail",
    favicon: "",
    order: 0,
  },
  {
    id: tabId("pin-calendar"),
    url: "https://calendar.google.com",
    title: "Google Calendar",
    favicon: "",
    order: 1,
  },
  {
    id: tabId("pin-slack"),
    url: "https://slack.com",
    title: "Slack",
    favicon: "",
    order: 2,
  },
];

/** Tab entries for pinned tabs so PinnedTabsStrip can resolve Favicon. */
const DEMO_PINNED_AS_TABS: Tab[] = DEMO_PINNED_TABS.map((pt, i) => ({
  id: pt.id,
  workspaceId: WS_WORK,
  url: pt.url,
  title: pt.title,
  favicon: pt.favicon,
  loading: false,
  bookmarked: true,
  lastAccessedAt: Date.now(),
  createdAt: Date.now(),
  order: i,
  folderId: null,
}));

export function makeDemoTabMap(): Map<TabId, Tab> {
  const map = new Map<TabId, Tab>();
  for (const tab of DEMO_TABS) {
    map.set(tab.id, tab);
  }
  return map;
}

/** Tab map that includes pinned tab entries for PinnedTabsStrip previews. */
export function makeDemoPinnedTabMap(): Map<TabId, Tab> {
  const map = makeDemoTabMap();
  for (const tab of DEMO_PINNED_AS_TABS) {
    map.set(tab.id, tab);
  }
  return map;
}

// ── Downloads ────────────────────────────────────────────────────

export const DEMO_DOWNLOADS: Download[] = [
  {
    id: "dl-progressing",
    filename: "project-assets.zip",
    url: "https://example.com/project-assets.zip",
    receivedBytes: 45_000_000,
    totalBytes: 100_000_000,
    state: "progressing",
  },
  {
    id: "dl-paused",
    filename: "design-system-v2.fig",
    url: "https://example.com/design-system-v2.fig",
    receivedBytes: 12_500_000,
    totalBytes: 50_000_000,
    state: "paused",
  },
  {
    id: "dl-completed",
    filename: "report-q4.pdf",
    url: "https://example.com/report-q4.pdf",
    receivedBytes: 2_400_000,
    totalBytes: 2_400_000,
    state: "completed",
  },
];

export function makeDemoDownloadMap(downloads: Download[] = DEMO_DOWNLOADS): Map<string, Download> {
  const map = new Map<string, Download>();
  for (const dl of downloads) {
    map.set(dl.id, dl);
  }
  return map;
}
