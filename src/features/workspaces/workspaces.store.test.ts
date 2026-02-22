import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId, WorkspaceId } from "../../shared/types";
import { makeWorkspace } from "../../test-utils";
import {
  WORKSPACES_CREATED,
  WORKSPACES_DELETED,
  WORKSPACES_LIST_CHANGED,
  WORKSPACES_SWITCHED,
  WORKSPACES_UPDATED,
} from "./workspaces.shared";
import { subscribeToEvents, useWorkspacesStore } from "./workspaces.store";

function setupEventBus() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const onEvent = vi.fn((name: string, cb: (payload: unknown) => void) => {
    handlers.set(name, cb);
    return () => handlers.delete(name);
  });
  return { handlers, onEvent };
}

describe("workspaces.store", () => {
  beforeEach(() => {
    useWorkspacesStore.setState({ workspaces: [], activeWorkspaceId: null });
  });

  it("WORKSPACES_SWITCHED sets activeWorkspaceId", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    handlers.get(WORKSPACES_SWITCHED)?.({
      workspaceId: "ws-2" as WorkspaceId,
      previousWorkspaceId: null,
      workspaceName: "Personal",
    });
    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("ws-2" as WorkspaceId);
  });

  it("WORKSPACES_CREATED appends workspace", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId });
    handlers.get(WORKSPACES_CREATED)?.({ workspace: ws });

    expect(useWorkspacesStore.getState().workspaces).toHaveLength(1);
    expect(useWorkspacesStore.getState().workspaces[0]).toEqual(ws);
  });

  it("WORKSPACES_CREATED auto-activates first workspace", () => {
    const { handlers, onEvent } = setupEventBus();
    subscribeToEvents(onEvent);

    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId });
    handlers.get(WORKSPACES_CREATED)?.({ workspace: ws });

    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("ws-1" as WorkspaceId);
  });

  it("WORKSPACES_CREATED does not override existing activeWorkspaceId", () => {
    const { handlers, onEvent } = setupEventBus();
    useWorkspacesStore.setState({ activeWorkspaceId: "ws-0" as WorkspaceId });
    subscribeToEvents(onEvent);

    const ws = makeWorkspace({ id: "ws-2" as WorkspaceId });
    handlers.get(WORKSPACES_CREATED)?.({ workspace: ws });

    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("ws-0" as WorkspaceId);
  });

  it("WORKSPACES_UPDATED replaces matching workspace", () => {
    const { handlers, onEvent } = setupEventBus();
    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Old" });
    useWorkspacesStore.setState({ workspaces: [ws] });
    subscribeToEvents(onEvent);

    const updated = { ...ws, name: "New" };
    handlers.get(WORKSPACES_UPDATED)?.({ workspace: updated });

    expect(useWorkspacesStore.getState().workspaces[0]?.name).toBe("New");
  });

  it("WORKSPACES_DELETED removes from list", () => {
    const { handlers, onEvent } = setupEventBus();
    const ws1 = makeWorkspace({ id: "ws-1" as WorkspaceId });
    const ws2 = makeWorkspace({ id: "ws-2" as WorkspaceId, name: "Personal" });
    useWorkspacesStore.setState({ workspaces: [ws1, ws2] });
    subscribeToEvents(onEvent);

    handlers.get(WORKSPACES_DELETED)?.({ workspaceId: "ws-1" as WorkspaceId });

    const state = useWorkspacesStore.getState();
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0]?.id).toBe("ws-2" as WorkspaceId);
  });

  it("WORKSPACES_LIST_CHANGED replaces list and preserves valid activeWorkspaceId", () => {
    const { handlers, onEvent } = setupEventBus();
    const ws1 = makeWorkspace({ id: "ws-1" as WorkspaceId });
    const ws2 = makeWorkspace({ id: "ws-2" as WorkspaceId });
    useWorkspacesStore.setState({ activeWorkspaceId: "ws-2" as WorkspaceId });
    subscribeToEvents(onEvent);

    handlers.get(WORKSPACES_LIST_CHANGED)?.({ workspaces: [ws1, ws2] });

    const state = useWorkspacesStore.getState();
    expect(state.workspaces).toHaveLength(2);
    expect(state.activeWorkspaceId).toBe("ws-2" as WorkspaceId);
  });

  it("WORKSPACES_LIST_CHANGED falls back to first when active removed", () => {
    const { handlers, onEvent } = setupEventBus();
    useWorkspacesStore.setState({ activeWorkspaceId: "gone" as WorkspaceId });
    subscribeToEvents(onEvent);

    const ws1 = makeWorkspace({ id: "ws-1" as WorkspaceId });
    handlers.get(WORKSPACES_LIST_CHANGED)?.({ workspaces: [ws1] });

    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe("ws-1" as WorkspaceId);
  });

  it("WORKSPACES_LIST_CHANGED sets null when list is empty", () => {
    const { handlers, onEvent } = setupEventBus();
    useWorkspacesStore.setState({ activeWorkspaceId: "ws-1" as WorkspaceId });
    subscribeToEvents(onEvent);

    handlers.get(WORKSPACES_LIST_CHANGED)?.({ workspaces: [] });

    expect(useWorkspacesStore.getState().activeWorkspaceId).toBeNull();
  });
});
