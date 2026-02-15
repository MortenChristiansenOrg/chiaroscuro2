import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import type { TabsCommands } from "../tabs/tabs.shared";
import { TABS_ACTIVATE } from "../tabs/tabs.shared";
import {
  WORKSPACES_CREATE,
  WORKSPACES_CREATED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_SWITCH,
  WORKSPACES_SWITCHED,
  type Workspace,
  type WorkspacesCommands,
  type WorkspacesEvents,
} from "./workspaces.shared";

type AllCommands = WorkspacesCommands & TabsCommands;
type AllEvents = WorkspacesEvents;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  setActiveTabId: (tabId: TabId | undefined) => void;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
  setActiveWorkspaceId: (id: WorkspaceId) => void;
}

// Shared state exposed via accessor for cross-feature queries
let _workspaces: Map<WorkspaceId, Workspace> | undefined;

export function getWorkspace(id: WorkspaceId): Workspace | undefined {
  return _workspaces?.get(id);
}

export function register(deps: Deps): void {
  const {
    commands,
    events,
    platform,
    getActiveTabId,
    setActiveTabId,
    getActiveWorkspaceId,
    setActiveWorkspaceId,
  } = deps;

  const workspaces = new Map<WorkspaceId, Workspace>();
  _workspaces = workspaces;

  function emitListChanged(): void {
    events.emit(WORKSPACES_LIST_CHANGED, { workspaces: [...workspaces.values()] });
  }

  commands.handle(WORKSPACES_SWITCH, async (payload) => {
    const { workspaceId } = payload;
    const ws = workspaces.get(workspaceId);
    if (!ws) return;

    const previousWsId = getActiveWorkspaceId() ?? null;
    if (previousWsId === workspaceId) return;

    // Save current ws active tab
    if (previousWsId) {
      const prevWs = workspaces.get(previousWsId);
      if (prevWs) {
        prevWs.activeTabId = getActiveTabId() ?? null;
      }
    }

    // Hide all tabs
    platform.hideAllTabs();

    // Switch
    setActiveWorkspaceId(workspaceId);

    // Activate new ws's tab
    if (ws.activeTabId) {
      await commands.send(TABS_ACTIVATE, { tabId: ws.activeTabId });
    } else {
      setActiveTabId(undefined);
    }

    events.emit(WORKSPACES_SWITCHED, { workspaceId, previousWorkspaceId: previousWsId });
  });

  commands.handle(WORKSPACES_CREATE, async (payload) => {
    const id = crypto.randomUUID() as WorkspaceId;
    const ws: Workspace = {
      id,
      name: payload.name,
      color: payload.color,
      icon: payload.icon,
      initial: payload.icon, // backward compat until renderer migrates to icon
      activeTabId: null,
    };
    workspaces.set(id, ws);
    events.emit(WORKSPACES_CREATED, { workspace: ws });
    emitListChanged();
    return id;
  });
}

export function start(deps: Deps): void {
  const { events, setActiveWorkspaceId } = deps;

  // Create default workspace
  const defaultId = crypto.randomUUID() as WorkspaceId;
  const defaultWs: Workspace = {
    id: defaultId,
    name: "Work",
    color: "oklch(0.6 0.12 230)",
    icon: "W",
    initial: "W", // backward compat until renderer migrates to icon
    activeTabId: null,
  };
  _workspaces?.set(defaultId, defaultWs);
  setActiveWorkspaceId(defaultId);

  events.emit(WORKSPACES_CREATED, { workspace: defaultWs });
  events.emit(WORKSPACES_LIST_CHANGED, {
    workspaces: _workspaces ? [..._workspaces.values()] : [],
  });
}
