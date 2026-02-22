import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "../../shared/types";
import { makeTab } from "../../test-utils";
import { SIDEBAR_VISIBILITY_CHANGED } from "./sidebar.shared";
import { subscribeToEvents, useSidebarStore } from "./sidebar.store";

function setupEventBus() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const onEvent = vi.fn((name: string, cb: (payload: unknown) => void) => {
    handlers.set(name, cb);
    return () => handlers.delete(name);
  });
  return { handlers, onEvent };
}

// Note: sidebar.store has module-level `lastTabCount`. Tests are ordered so that
// each test accounts for the cumulative state. The unsub between tests resets
// event handlers but not `lastTabCount`, so we're careful about sequencing.

describe("sidebar.store", () => {
  it("SIDEBAR_VISIBILITY_CHANGED sets visible", () => {
    useSidebarStore.setState({ visible: true, announcement: "" });
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);

    handlers.get(SIDEBAR_VISIBILITY_CHANGED)?.({ visible: false });
    expect(useSidebarStore.getState().visible).toBe(false);

    handlers.get(SIDEBAR_VISIBILITY_CHANGED)?.({ visible: true });
    expect(useSidebarStore.getState().visible).toBe(true);

    unsub();
  });

  it("TABS_LIST_CHANGED first emission primes count without announcement", () => {
    // lastTabCount is 0 from module init (or previous test cleanup)
    useSidebarStore.setState({ visible: true, announcement: "" });
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);

    // First emission — primes lastTabCount, no announcement
    handlers.get("tabs:list-changed")?.({ tabs: [makeTab()] });
    expect(useSidebarStore.getState().announcement).toBe("");

    unsub();
    // After this test, module-level lastTabCount = 1
  });

  it("TABS_LIST_CHANGED announces when count changes", () => {
    // lastTabCount = 1 from previous test
    useSidebarStore.setState({ announcement: "" });
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);

    // Different count → announcement
    handlers.get("tabs:list-changed")?.({ tabs: [makeTab(), makeTab()] });
    expect(useSidebarStore.getState().announcement).toBe("2 tabs");

    unsub();
    // lastTabCount = 2
  });

  it("TABS_LIST_CHANGED skips announcement when count unchanged", () => {
    // lastTabCount = 2 from previous test
    useSidebarStore.setState({ announcement: "" });
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);

    handlers.get("tabs:list-changed")?.({ tabs: [makeTab(), makeTab()] }); // still 2
    expect(useSidebarStore.getState().announcement).toBe("");

    unsub();
  });

  it("WORKSPACES_SWITCHED sets announcement with name and tab count", () => {
    // lastTabCount = 2 from previous test
    useSidebarStore.setState({ announcement: "" });
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);

    handlers.get("workspaces:switched")?.({
      workspaceId: "ws-2" as WorkspaceId,
      previousWorkspaceId: "ws-1" as WorkspaceId,
      workspaceName: "Personal",
    });

    expect(useSidebarStore.getState().announcement).toBe("Switched to Personal, 2 tabs");

    unsub();
  });

  it("WORKSPACES_SWITCHED uses singular for 1 tab", () => {
    useSidebarStore.setState({ announcement: "" });
    const { handlers, onEvent } = setupEventBus();
    const unsub = subscribeToEvents(onEvent);

    // Prime to 1
    handlers.get("tabs:list-changed")?.({ tabs: [makeTab()] });

    handlers.get("workspaces:switched")?.({
      workspaceId: "ws-2" as WorkspaceId,
      previousWorkspaceId: "ws-1" as WorkspaceId,
      workspaceName: "Personal",
    });

    expect(useSidebarStore.getState().announcement).toBe("Switched to Personal, 1 tab");

    unsub();
  });
});
