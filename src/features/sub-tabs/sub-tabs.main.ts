import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Bounds, Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { featureState } from "../../shared/feature-state";
import { logError } from "../../shared/log";
import { TabScope } from "../../shared/tab-scope";
import type { TabId, WindowId, WorkspaceId } from "../../shared/types";
import {
  COMMAND_PALETTE_HIDDEN,
  COMMAND_PALETTE_SHOWN,
} from "../command-palette/command-palette.shared";
import type { CommandPaletteEvents } from "../command-palette/command-palette.shared";
import { getContentBounds } from "../tabs/tabs.main";
import {
  TABS_ACTIVATED,
  TABS_ADOPT,
  TABS_CLOSED,
  TABS_CONTENT_BOUNDS_CHANGED,
} from "../tabs/tabs.shared";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import {
  SUB_TABS_CLOSE,
  SUB_TABS_CLOSED,
  SUB_TABS_CLOSE_ALL,
  SUB_TABS_GET_STACK,
  SUB_TABS_OPEN,
  SUB_TABS_OPENED,
  SUB_TABS_PROMOTE,
  SUB_TABS_PROMOTED,
  SUB_TABS_STACK_CHANGED,
  SUB_TABS_UPDATED,
  type SubTab,
  type SubTabsCommands,
  type SubTabsEvents,
} from "./sub-tabs.shared";

// Bounds animation for sub-tab WCV enter/exit transitions.
// WCV surfaces are composited as opaque layers (no CSS opacity support),
// so we animate setBounds() to scale in/out instead of fading.
const ANIM_DURATION = 200;
const ENTER_SCALE = 0.88;

/** Compute bounds scaled around center. */
function scaleBounds(b: Bounds, scale: number): Bounds {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const w = b.width * scale;
  const h = b.height * scale;
  return {
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

// Frame position constants for the sub-tab child window layout
const FRAME_TOP = 0.075;
const FRAME_LEFT = 0.08;
const FRAME_RIGHT = 0.04;
const FRAME_BTN_WIDTH = 48;
const FRAME_GAP = 12;

/** Frame bounds in absolute content-area coordinates (for platform.showSubTabWindow etc.) */
function computeFrameBounds(cb: Bounds): Bounds {
  const w = cb.width * (1 - FRAME_LEFT - FRAME_RIGHT) - FRAME_BTN_WIDTH - FRAME_GAP;
  return {
    x: Math.round(cb.x + cb.width * FRAME_LEFT),
    y: Math.round(cb.y + cb.height * FRAME_TOP),
    width: Math.round(w),
    height: Math.round(cb.height * 0.85),
  };
}

/** Frame bounds relative to the child window (which covers the content area). */
function computeChildFrameBounds(cb: Bounds): Bounds {
  const w = cb.width * (1 - FRAME_LEFT - FRAME_RIGHT) - FRAME_BTN_WIDTH - FRAME_GAP;
  return {
    x: Math.round(cb.width * FRAME_LEFT),
    y: Math.round(cb.height * FRAME_TOP),
    width: Math.round(w),
    height: Math.round(cb.height * 0.85),
  };
}

type AllCommands = SubTabsCommands & TabsCommands;
type AllEvents = SubTabsEvents &
  TabsEvents &
  Pick<CommandPaletteEvents, typeof COMMAND_PALETTE_SHOWN | typeof COMMAND_PALETTE_HIDDEN>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
}

const _state = featureState<{
  stacks: Map<TabId, SubTab[]>;
}>("sub-tabs");

/**
 * Resolve the root parent tabId for a source tab. If the source is itself
 * a sub-tab, walk up to find the parent regular tab.
 */
function resolveParent(sourceTabId: TabId, stacks: Map<TabId, SubTab[]>): TabId {
  for (const [parentId, stack] of stacks) {
    if (stack.some((st) => st.id === sourceTabId)) {
      return parentId;
    }
  }
  return sourceTabId;
}

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events, platform, getActiveWindowId, getActiveTabId } = deps;

    const stacks = new Map<TabId, SubTab[]>();
    const tabScope = new TabScope();
    let contentBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };

    // CSS keys for disabling input on parent tabs while sub-tabs are active.
    // The dark backdrop is handled by the native overlay (canvas with hole).
    const disabledInputKeys = new Map<TabId, Promise<string>>();
    const INPUT_BLOCK_CSS =
      "html{pointer-events:none!important;overflow:hidden!important;user-select:none!important}";

    function disableParentInput(parentTabId: TabId): void {
      if (disabledInputKeys.has(parentTabId)) return;
      disabledInputKeys.set(parentTabId, platform.insertCSS(parentTabId, INPUT_BLOCK_CSS));
    }

    function enableParentInput(parentTabId: TabId): void {
      const keyPromise = disabledInputKeys.get(parentTabId);
      if (!keyPromise) return;
      disabledInputKeys.delete(parentTabId);
      keyPromise
        .then((key) => platform.removeInsertedCSS(parentTabId, key))
        .catch(logError("sub-tabs", "remove input-block CSS"));
    }

    _state.init({ stacks });

    function getStack(parentTabId: TabId): SubTab[] {
      let stack = stacks.get(parentTabId);
      if (!stack) {
        stack = [];
        stacks.set(parentTabId, stack);
      }
      return stack;
    }

    function topSubTab(parentTabId: TabId): SubTab | undefined {
      const stack = stacks.get(parentTabId);
      return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
    }

    function emitStackChanged(parentTabId: TabId): void {
      const stack = stacks.get(parentTabId) ?? [];
      events.emit(SUB_TABS_STACK_CHANGED, { parentTabId, stack: [...stack] });
    }

    function showTopSubTab(parentTabId: TabId): void {
      const top = topSubTab(parentTabId);
      if (!top || contentBounds.width === 0) return;
      const cfb = computeChildFrameBounds(contentBounds);
      platform.attachTabToSubTabWindow(top.id, cfb);
    }

    function hideAllSubTabs(parentTabId: TabId): void {
      const stack = stacks.get(parentTabId);
      if (!stack) return;
      for (const st of stack) {
        platform.hideTab(st.id);
      }
    }

    function attachSubTabListeners(subTabId: TabId, parentTabId: TabId): void {
      tabScope.add(
        subTabId,
        platform.onTabEvent(subTabId, "page-title-updated", (_event, title) => {
          const stack = stacks.get(parentTabId);
          const st = stack?.find((s) => s.id === subTabId);
          if (!st || typeof title !== "string") return;
          st.title = title;
          events.emit(SUB_TABS_UPDATED, { parentTabId, subTab: { ...st } });
        }),
      );

      tabScope.add(
        subTabId,
        platform.onTabEvent(subTabId, "did-navigate", (_event, url) => {
          const stack = stacks.get(parentTabId);
          const st = stack?.find((s) => s.id === subTabId);
          if (!st || typeof url !== "string") return;
          st.url = url;
          events.emit(SUB_TABS_UPDATED, { parentTabId, subTab: { ...st } });
        }),
      );

      tabScope.add(
        subTabId,
        platform.onTabEvent(subTabId, "did-navigate-in-page", (_event, url) => {
          const stack = stacks.get(parentTabId);
          const st = stack?.find((s) => s.id === subTabId);
          if (!st || typeof url !== "string") return;
          st.url = url;
          events.emit(SUB_TABS_UPDATED, { parentTabId, subTab: { ...st } });
        }),
      );

      tabScope.add(
        subTabId,
        platform.onTabEvent(subTabId, "did-start-loading", () => {
          const stack = stacks.get(parentTabId);
          const st = stack?.find((s) => s.id === subTabId);
          if (!st) return;
          st.loading = true;
          events.emit(SUB_TABS_UPDATED, { parentTabId, subTab: { ...st } });
        }),
      );

      tabScope.add(
        subTabId,
        platform.onTabEvent(subTabId, "did-stop-loading", () => {
          const stack = stacks.get(parentTabId);
          const st = stack?.find((s) => s.id === subTabId);
          if (!st) return;
          st.loading = false;
          const currentUrl = platform.getTabUrl(subTabId);
          if (currentUrl) st.url = currentUrl;
          const currentTitle = platform.getTabTitle(subTabId);
          if (currentTitle) st.title = currentTitle;
          events.emit(SUB_TABS_UPDATED, { parentTabId, subTab: { ...st } });
        }),
      );

      tabScope.add(
        subTabId,
        platform.onTabEvent(subTabId, "page-favicon-updated", (_event, favicons) => {
          const stack = stacks.get(parentTabId);
          const st = stack?.find((s) => s.id === subTabId);
          if (!st || !Array.isArray(favicons)) return;
          const urls = favicons as string[];
          if (urls.length > 0 && typeof urls[0] === "string") {
            st.favicon = urls[0];
            events.emit(SUB_TABS_UPDATED, { parentTabId, subTab: { ...st } });
          }
        }),
      );
    }

    async function closeSubTab(parentTabId: TabId, subTabId: TabId): Promise<void> {
      tabScope.cleanup(subTabId);
      platform.hideTab(subTabId);
      platform.closeTab(subTabId).catch(logError("sub-tabs", "close sub-tab"));

      const stack = stacks.get(parentTabId);
      if (stack) {
        const idx = stack.findIndex((s) => s.id === subTabId);
        if (idx !== -1) stack.splice(idx, 1);
        if (stack.length === 0) stacks.delete(parentTabId);
      }

      events.emit(SUB_TABS_CLOSED, { parentTabId, subTabId });
    }

    // ── Intercept window-open ──────────────────────────────────────
    platform.onWindowOpen((url, sourceTabId, disposition) => {
      // Ctrl+click / middle-click → new standalone tab
      if (disposition === "background-tab") {
        commands
          .send("tabs:create", { url, activate: false })
          .catch(logError("sub-tabs", "create standalone tab from ctrl+click"));
        return true;
      }

      // All other dispositions → sub-tab
      const windowId = getActiveWindowId();
      if (!windowId) return false;

      const parentTabId = resolveParent(sourceTabId, stacks);
      commands
        .send(SUB_TABS_OPEN, { parentTabId, url })
        .catch(logError("sub-tabs", "open sub-tab from window-open"));
      return true;
    });

    // ── Command handlers ───────────────────────────────────────────

    commands.handle(SUB_TABS_OPEN, async (payload) => {
      const { parentTabId, url } = payload;
      const windowId = getActiveWindowId();
      if (!windowId) throw new Error("No active window");

      // Ensure we have content bounds — fetch from tabs if local copy is stale
      if (contentBounds.width === 0) {
        const fresh = getContentBounds();
        if (fresh.width > 0) contentBounds = fresh;
      }

      const subTabId = await platform.createTab(windowId, url);
      const subTab: SubTab = {
        id: subTabId,
        parentTabId,
        url,
        title: url,
        favicon: "",
        loading: true,
      };

      const stack = getStack(parentTabId);

      // Hide current top sub-tab (if any)
      const prevTop = stack.length > 0 ? stack[stack.length - 1] : undefined;
      if (prevTop) platform.hideTab(prevTop.id);

      const isFirst = stack.length === 0;
      if (isFirst) {
        disableParentInput(parentTabId);
      }

      stack.push(subTab);
      attachSubTabListeners(subTabId, parentTabId);

      const fb = contentBounds.width > 0 ? computeFrameBounds(contentBounds) : null;
      const cfb = contentBounds.width > 0 ? computeChildFrameBounds(contentBounds) : null;

      // Show child window with backdrop fade — must await so the child window
      // is visible before we attach the WCV and start its bounds animation.
      if (isFirst && fb) {
        await platform.showSubTabWindow(contentBounds, fb, parentTabId);
      }

      // Attach WCV at scaled-down bounds, then animate to full size
      if (cfb) {
        const startBounds = scaleBounds(cfb, ENTER_SCALE);
        platform.attachTabToSubTabWindow(subTabId, startBounds);
        platform.animateTabBounds(subTabId, startBounds, cfb, ANIM_DURATION).catch(() => {});
      }

      events.emit(SUB_TABS_OPENED, { parentTabId, subTab: { ...subTab } });
      emitStackChanged(parentTabId);

      return subTabId;
    });

    commands.handle(SUB_TABS_CLOSE, async (payload) => {
      const { parentTabId } = payload;
      const top = topSubTab(parentTabId);
      if (!top) return;

      const wasLast = (stacks.get(parentTabId)?.length ?? 0) <= 1;

      if (wasLast) {
        emitStackChanged(parentTabId);
        // Animate WCV bounds down + backdrop fade out in parallel
        const cfb = computeChildFrameBounds(contentBounds);
        const exitBounds = scaleBounds(cfb, ENTER_SCALE);
        await Promise.all([
          platform.animateTabBounds(top.id, cfb, exitBounds, ANIM_DURATION),
          platform.hideSubTabWindow(),
        ]);
        platform.detachTabFromSubTabWindow(top.id);
        await closeSubTab(parentTabId, top.id);
        enableParentInput(parentTabId);
      } else {
        await closeSubTab(parentTabId, top.id);
        showTopSubTab(parentTabId);
      }

      emitStackChanged(parentTabId);
    });

    commands.handle(SUB_TABS_CLOSE_ALL, async (payload) => {
      const { parentTabId } = payload;
      const stack = stacks.get(parentTabId);
      if (!stack || stack.length === 0) return;

      // Animate top sub-tab bounds down + backdrop fade out in parallel
      const topSt = stack[stack.length - 1];
      const cfb = computeChildFrameBounds(contentBounds);
      const exitBounds = scaleBounds(cfb, ENTER_SCALE);
      await Promise.all([
        topSt
          ? platform.animateTabBounds(topSt.id, cfb, exitBounds, ANIM_DURATION)
          : Promise.resolve(),
        platform.hideSubTabWindow(),
      ]);

      // Detach all WCVs back to main window
      for (const st of stack) {
        platform.detachTabFromSubTabWindow(st.id);
      }

      const toClose = [...stack].reverse();
      for (const st of toClose) {
        await closeSubTab(parentTabId, st.id);
      }

      enableParentInput(parentTabId);
      emitStackChanged(parentTabId);
    });

    commands.handle(SUB_TABS_PROMOTE, async (payload) => {
      const { parentTabId } = payload;
      const top = topSubTab(parentTabId);
      if (!top) throw new Error("No sub-tab to promote");

      const subTabId = top.id;

      // Remove listeners managed by sub-tabs
      tabScope.cleanup(subTabId);

      // Remove from stack and close any sub-tabs above
      const stack = stacks.get(parentTabId);
      if (stack) {
        const idx = stack.findIndex((s) => s.id === subTabId);
        if (idx !== -1) {
          const above = stack.splice(idx);
          for (const st of above) {
            if (st.id !== subTabId) {
              tabScope.cleanup(st.id);
              platform.detachTabFromSubTabWindow(st.id);
              await platform.closeTab(st.id);
              events.emit(SUB_TABS_CLOSED, { parentTabId, subTabId: st.id });
            }
          }
        }
        if (stack.length === 0) {
          stacks.delete(parentTabId);
          enableParentInput(parentTabId);
        }
      }

      // Detach WCV from child window back to main window, then hide child window
      platform.detachTabFromSubTabWindow(subTabId);
      platform.hideSubTabWindowInstant();
      platform.hideTab(subTabId);

      const newTabId = await commands.send(TABS_ADOPT, { tabId: subTabId, activate: true });

      events.emit(SUB_TABS_PROMOTED, { parentTabId, subTabId, newTabId });
      emitStackChanged(parentTabId);

      return newTabId;
    });

    commands.handle(SUB_TABS_GET_STACK, (payload) => {
      return [...(stacks.get(payload.parentTabId) ?? [])];
    });

    // ── Cross-feature listeners ────────────────────────────────────

    // Track content area bounds to compute sub-tab frame position
    events.on(TABS_CONTENT_BOUNDS_CHANGED, (bounds) => {
      contentBounds = bounds;
      const activeTabId = getActiveTabId();
      if (activeTabId) {
        const top = topSubTab(activeTabId);
        if (top && contentBounds.width > 0) {
          const fb = computeFrameBounds(contentBounds);
          const cfb = computeChildFrameBounds(contentBounds);
          platform.updateSubTabWindowBounds(contentBounds, fb);
          platform.attachTabToSubTabWindow(top.id, cfb);
        }
      }
    });

    // When a tab is activated, manage sub-tab + child window visibility
    events.on(TABS_ACTIVATED, ({ tabId, previousTabId }) => {
      if (previousTabId) {
        hideAllSubTabs(previousTabId);
        if (topSubTab(previousTabId)) {
          platform.hideSubTabWindowInstant();
        }
      }

      if (tabId) {
        const top = topSubTab(tabId);
        if (top) {
          disableParentInput(tabId);
          // Show child window immediately (no animation) when switching back
          if (contentBounds.width > 0) {
            const fb = computeFrameBounds(contentBounds);
            platform.showSubTabWindowStatic(contentBounds, fb, tabId);
          }
          showTopSubTab(tabId);
        }
      }
    });

    // When parent tab is closed, close all its sub-tabs
    events.on(TABS_CLOSED, ({ tabId }) => {
      const stack = stacks.get(tabId);
      if (!stack || stack.length === 0) return;

      platform.hideSubTabWindowInstant();
      for (const st of stack) {
        tabScope.cleanup(st.id);
        platform.detachTabFromSubTabWindow(st.id);
        platform.closeTab(st.id).catch(logError("sub-tabs", "close sub-tab on parent close"));
      }
      stacks.delete(tabId);
    });

    // Track command palette state to avoid Escape race condition.
    // Menu accelerators fire globally — when the palette is open and user presses
    // Escape, both the palette's handler and the sub-tab dismiss fire simultaneously.
    let commandPaletteOpen = false;
    events.on(COMMAND_PALETTE_SHOWN, () => {
      commandPaletteOpen = true;
    });
    events.on(COMMAND_PALETTE_HIDDEN, () => {
      commandPaletteOpen = false;
    });

    // Escape to dismiss topmost sub-tab (skip if command palette is open)
    const dismissTopSubTab = () => {
      if (commandPaletteOpen) return;
      const activeTabId = getActiveTabId();
      if (!activeTabId) return;
      if (!topSubTab(activeTabId)) return;
      commands
        .send(SUB_TABS_CLOSE, { parentTabId: activeTabId })
        .catch(logError("sub-tabs", "dismiss sub-tab via escape"));
    };
    platform.registerLocalShortcut("Escape", dismissTopSubTab);
  },

  teardown() {
    _state.reset();
  },
});

// ── Exported accessor ─────────────────────────────────────────────

/** Check if a parent tab currently has sub-tabs open. */
export function hasSubTabs(tabId: TabId): boolean {
  if (!_state.initialized) return false;
  const { stacks } = _state.get();
  const stack = stacks.get(tabId);
  return !!stack && stack.length > 0;
}
