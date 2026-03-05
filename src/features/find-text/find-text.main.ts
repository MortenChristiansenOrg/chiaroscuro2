import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId } from "../../shared/types";
import {
  TABS_ACTIVATED,
  TABS_CLOSED,
  type TabsActivatedEvent,
  type TabsClosedEvent,
} from "../tabs/tabs.shared";
import {
  FIND_NEXT,
  FIND_PREVIOUS,
  FIND_RESULT,
  FIND_START,
  FIND_STARTED,
  FIND_STOP,
  FIND_STOPPED,
  type FindTextCommands,
  type FindTextEvents,
} from "./find-text.shared";

type AllEvents = FindTextEvents & {
  [K in typeof TABS_ACTIVATED]: TabsActivatedEvent;
} & {
  [K in typeof TABS_CLOSED]: TabsClosedEvent;
};

interface Deps {
  commands: CommandBus<FindTextCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveTabId: () => TabId | undefined;
  getActiveWindowId: () => WindowId | undefined;
}

export function register({
  commands,
  events,
  platform,
  getActiveTabId,
  getActiveWindowId,
}: Deps): void {
  let findActive = false;
  const tabCleanups = new Map<TabId, () => void>();

  function listenForResults(tabId: TabId): void {
    if (tabCleanups.has(tabId)) return;
    const cleanup = platform.onTabEvent(tabId, "found-in-page", (...args: unknown[]) => {
      const result = args[1] as {
        activeMatchOrdinal: number;
        matches: number;
        finalUpdate: boolean;
      };
      if (result.finalUpdate) {
        events.emit(FIND_RESULT, {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches,
        });
      }
    });
    tabCleanups.set(tabId, cleanup);
  }

  function cleanupTab(tabId: TabId): void {
    tabCleanups.get(tabId)?.();
    tabCleanups.delete(tabId);
  }

  commands.handle(FIND_START, async () => {
    findActive = true;
    const windowId = getActiveWindowId();
    if (windowId) platform.focusShell(windowId);
    events.emit(FIND_STARTED, undefined);
  });

  commands.handle(FIND_STOP, async () => {
    if (!findActive) return;
    findActive = false;
    const tabId = getActiveTabId();
    if (tabId) {
      platform.stopFindInPage(tabId);
      cleanupTab(tabId);
    }
    events.emit(FIND_STOPPED, undefined);
  });

  commands.handle(FIND_NEXT, async ({ text }) => {
    const tabId = getActiveTabId();
    if (!tabId || !text) return;
    if (!findActive) {
      findActive = true;
      events.emit(FIND_STARTED, undefined);
    }
    listenForResults(tabId);
    platform.findInPage(tabId, text, { forward: true, findNext: true });
  });

  commands.handle(FIND_PREVIOUS, async ({ text }) => {
    const tabId = getActiveTabId();
    if (!tabId || !text) return;
    if (!findActive) {
      findActive = true;
      events.emit(FIND_STARTED, undefined);
    }
    listenForResults(tabId);
    platform.findInPage(tabId, text, { forward: false, findNext: true });
  });

  // Stop find when tab changes or closes
  events.on(TABS_ACTIVATED, () => {
    if (findActive) {
      commands.send(FIND_STOP, undefined).catch(console.error);
    }
  });

  events.on(TABS_CLOSED, ({ tabId }) => {
    cleanupTab(tabId);
    if (findActive && tabId === getActiveTabId()) {
      findActive = false;
      events.emit(FIND_STOPPED, undefined);
    }
  });

  // Keyboard shortcuts — register as both global (OS-level interception via
  // globalShortcut, active only when app is focused) and local (before-input-event
  // + menu accelerator fallback) for maximum reliability.
  const startFind = () => {
    commands.send(FIND_START, undefined).catch(console.error);
  };
  platform.registerShortcut("CommandOrControl+F", startFind);
  platform.registerLocalShortcut("CommandOrControl+F", startFind);
  platform.registerShortcut("F3", startFind);
  platform.registerLocalShortcut("F3", startFind);
}
