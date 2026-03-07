import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId } from "../../shared/types";
import type { TabsEvents } from "../tabs/tabs.shared";
import { TABS_ACTIVATED, TABS_CLOSED } from "../tabs/tabs.shared";
import {
  TERMINAL_CLEAR,
  TERMINAL_CLEARED,
  TERMINAL_OUTPUT,
  TERMINAL_TOGGLE,
  TERMINAL_VISIBILITY_CHANGED,
  TERMINAL_WRITE,
  type TerminalCommands,
  type TerminalEvents,
  type TerminalLine,
} from "./terminal.shared";

const MAX_LINES = 1000;

// Strip ANSI escape sequences (colors, cursor movement, etc.)
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape matching
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

type AllCommands = TerminalCommands;
type AllEvents = TerminalEvents & Pick<TabsEvents, typeof TABS_CLOSED | typeof TABS_ACTIVATED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveTabId: () => TabId | undefined;
}

const buffers = new Map<TabId, TerminalLine[]>();
let visible = false;

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events, platform, getActiveTabId } = deps;

    commands.handle(TERMINAL_TOGGLE, async () => {
      visible = !visible;
      // When terminal is open, remove bottom border radius from WCV
      const tabId = getActiveTabId();
      if (tabId) {
        platform.setTabBorderRadius(tabId, visible ? 0 : 8);
      }
      events.emit(TERMINAL_VISIBILITY_CHANGED, { visible });
    });

    commands.handle(TERMINAL_CLEAR, async () => {
      const tabId = getActiveTabId();
      if (!tabId) return;
      buffers.delete(tabId);
      events.emit(TERMINAL_CLEARED, { tabId });
    });

    commands.handle(TERMINAL_WRITE, async ({ tabId, data, type }) => {
      let buffer = buffers.get(tabId);
      if (!buffer) {
        buffer = [];
        buffers.set(tabId, buffer);
      }

      // Split data into lines, add each
      const lines = data.split("\n");
      for (const [i, text] of lines.entries()) {
        // Skip only the trailing empty string from split (e.g., "foo\n" → ["foo", ""])
        if (text.length === 0 && i === lines.length - 1) continue;
        const line: TerminalLine = { id: crypto.randomUUID(), text: stripAnsi(text), type };
        buffer.push(line);
        events.emit(TERMINAL_OUTPUT, { tabId, line });
      }

      // Trim to max
      if (buffer.length > MAX_LINES) {
        buffer.splice(0, buffer.length - MAX_LINES);
      }
    });

    // Set border radius when tab activates (0 if terminal visible, 8 otherwise)
    events.on(TABS_ACTIVATED, ({ tabId }) => {
      if (tabId) {
        platform.setTabBorderRadius(tabId, visible ? 0 : 8);
      }
    });

    // Clean up buffer when tab closes
    events.on(TABS_CLOSED, ({ tabId }) => {
      buffers.delete(tabId);
    });

    // Register keyboard shortcut for ½ key (the key left of 1 on Nordic keyboards)
    const toggleTerminal = () => {
      commands.send(TERMINAL_TOGGLE, undefined).catch(console.error);
    };
    // ½ is non-ASCII — only works as a local shortcut (before-input-event),
    // globalShortcut rejects non-ASCII accelerators.
    platform.registerLocalShortcut("½", toggleTerminal);
  },

  start(deps) {
    deps.events.emit(TERMINAL_VISIBILITY_CHANGED, { visible });
  },
});

/** Get the buffer for a tab (used by tests). */
export function getBuffer(tabId: TabId): TerminalLine[] | undefined {
  return buffers.get(tabId);
}

/** Reset module state (for tests). */
export function _reset(): void {
  buffers.clear();
  visible = false;
}
