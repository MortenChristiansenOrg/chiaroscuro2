import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import type { TabId, WindowId } from "../../shared/types";
import {
  WINDOW_CLOSE,
  WINDOW_COPY_ADDRESS,
  WINDOW_MAXIMIZED_CHANGED,
  WINDOW_MAXIMIZE_RESTORE,
  WINDOW_MINIMIZE,
  type WindowChromeCommands,
  type WindowChromeEvents,
} from "./window-chrome.shared";

/** Known ad-tracking query parameters to strip when copying URLs */
const TRACKING_PARAMS = new Set([
  // Google / general
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gclsrc",
  // Facebook / Meta
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "fb_ref",
  // Microsoft
  "msclkid",
  // Hubspot
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
  // Mailchimp
  "mc_cid",
  "mc_eid",
  // Others
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
    // Remove trailing '?' if no params remain
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

/** Phase 1: register command handlers (no side effects) */
export function register({
  commands,
  events,
  platform,
  getActiveWindowId,
  getActiveTabId,
}: Deps): void {
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
}

/** Phase 2: emit initial state (after all features registered) */
export function start({ events, platform, getActiveWindowId }: Deps): void {
  const windowId = getActiveWindowId();
  if (windowId) {
    events.emit(WINDOW_MAXIMIZED_CHANGED, {
      maximized: platform.isWindowMaximized(windowId),
    });
  }
}
