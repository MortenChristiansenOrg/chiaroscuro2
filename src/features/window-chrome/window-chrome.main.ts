import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId, WindowId } from "../../shared/types";
import {
  WINDOW_CLOSE,
  WINDOW_COPY_ADDRESS,
  WINDOW_GO_BACK,
  WINDOW_GO_FORWARD,
  WINDOW_MAXIMIZED_CHANGED,
  WINDOW_MAXIMIZE_RESTORE,
  WINDOW_MINIMIZE,
  WINDOW_RELOAD,
  type WindowChromeCommands,
  type WindowChromeEvents,
} from "./window-chrome.shared";

/** Known ad-tracking query parameters to strip when copying URLs */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gclsrc",
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "fb_ref",
  "msclkid",
  "hsa_cam",
  "hsa_grp",
  "hsa_mt",
  "hsa_src",
  "hsa_ad",
  "hsa_acc",
  "hsa_net",
  "hsa_ver",
  "hsa_la",
  "hsa_ol",
  "hsa_kw",
  "hsa_tgt",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "yclid",
  "twclid",
  "ttclid",
  "igshid",
  "si",
]);

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return url;
    const result = parsed.toString();
    return result.endsWith("?") ? result.slice(0, -1) : result;
  } catch {
    return url;
  }
}

interface Deps {
  commands: CommandBus<WindowChromeCommands>;
  events: EventBus<WindowChromeEvents>;
  platform: Platform;
  getActiveWindowId: () => WindowId | undefined;
  getActiveTabId: () => TabId | undefined;
}

export default defineFeature<Deps>({
  register({ commands, events, platform, getActiveWindowId, getActiveTabId }) {
    commands.handle(WINDOW_MINIMIZE, async () => {
      const windowId = getActiveWindowId();
      if (windowId) await platform.minimizeWindow(windowId);
    });

    commands.handle(WINDOW_MAXIMIZE_RESTORE, async () => {
      const windowId = getActiveWindowId();
      if (!windowId) return;
      if (platform.isWindowMaximized(windowId)) {
        await platform.unmaximizeWindow(windowId);
        events.emit(WINDOW_MAXIMIZED_CHANGED, { maximized: false });
      } else {
        await platform.maximizeWindow(windowId);
        events.emit(WINDOW_MAXIMIZED_CHANGED, { maximized: true });
      }
    });

    commands.handle(WINDOW_CLOSE, async () => {
      const windowId = getActiveWindowId();
      if (windowId) await platform.closeWindow(windowId);
    });

    commands.handle(WINDOW_COPY_ADDRESS, () => {
      const tabId = getActiveTabId();
      if (!tabId) return;
      const url = platform.getTabUrl(tabId);
      if (url) {
        platform.writeClipboard(stripTrackingParams(url));
      }
    });

    commands.handle(WINDOW_GO_BACK, () => {
      const tabId = getActiveTabId();
      if (tabId) platform.goBack(tabId);
    });

    commands.handle(WINDOW_GO_FORWARD, () => {
      const tabId = getActiveTabId();
      if (tabId) platform.goForward(tabId);
    });

    commands.handle(WINDOW_RELOAD, () => {
      const tabId = getActiveTabId();
      if (tabId) platform.reload(tabId);
    });
  },

  start({ events, platform, getActiveWindowId }) {
    const windowId = getActiveWindowId();
    if (windowId) {
      events.emit(WINDOW_MAXIMIZED_CHANGED, {
        maximized: platform.isWindowMaximized(windowId),
      });
    }
  },
});
