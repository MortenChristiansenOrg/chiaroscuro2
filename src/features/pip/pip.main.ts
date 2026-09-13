import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import type { TabId } from "../../shared/types";
import type {
  TABS_ACTIVATED,
  TABS_CLOSED,
  TabsActivatedEvent,
  TabsClosedEvent,
} from "../tabs/tabs.shared";
import {
  PIP_ACTIVATED,
  PIP_CLOSE,
  PIP_DEACTIVATED,
  PIP_PLAY_STATE_CHANGED,
  PIP_RETURN_TO_TAB,
  PIP_TOGGLE_PLAY,
  type PipCommands,
  type PipEvents,
} from "./pip.shared";

type AllCommands = PipCommands & {
  "tabs:activate": { payload: { tabId: TabId }; response: undefined };
};
type AllEvents = PipEvents & {
  [K in typeof TABS_ACTIVATED]: TabsActivatedEvent;
} & {
  [K in typeof TABS_CLOSED]: TabsClosedEvent;
};

/** JS: detect a playing <video> element. */
const DETECT_VIDEO_JS = `(function() {
  var videos = document.querySelectorAll('video');
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    if (!v.paused && v.readyState >= 2 && v.duration > 0) return true;
  }
  return false;
})()`;

/** JS: enter native PiP via the browser's built-in API. */
const ENTER_PIP_JS = `(function() {
  var videos = document.querySelectorAll('video');
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    if (!v.paused && v.readyState >= 2 && v.duration > 0) {
      v.requestPictureInPicture().catch(function() {});
      return true;
    }
  }
  return false;
})()`;

/** JS: exit native PiP. */
const EXIT_PIP_JS = `(function() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(function() {});
    return true;
  }
  return false;
})()`;

/** JS: pause the PiP video. */
const PAUSE_VIDEO_JS = `(function() {
  var v = document.pictureInPictureElement;
  if (v && !v.paused) { v.pause(); return true; }
  return false;
})()`;

/** JS: play the PiP video. */
const PLAY_VIDEO_JS = `(function() {
  var v = document.pictureInPictureElement;
  if (v && v.paused) { v.play(); return true; }
  return false;
})()`;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  getActiveTabId: () => TabId | undefined;
}

export default defineFeature<Deps>({
  register(deps) {
    const { commands, events, platform } = deps;

    let pipTabId: TabId | undefined;
    let pipPlaying = true;

    function dismissPip(): void {
      if (!pipTabId) return;
      const tabId = pipTabId;
      pipTabId = undefined;
      // Exit native PiP
      platform.executeJavaScript(tabId, EXIT_PIP_JS).catch(() => {});
      events.emit(PIP_DEACTIVATED, undefined);
    }

    // ── Command handlers ────────────────────────────────────────

    commands.handle(PIP_CLOSE, async () => {
      if (!pipTabId) return;
      // Pause the video and exit PiP
      try {
        await platform.executeJavaScript(pipTabId, PAUSE_VIDEO_JS);
      } catch {
        // tab may be destroyed
      }
      dismissPip();
    });

    commands.handle(PIP_TOGGLE_PLAY, async () => {
      if (!pipTabId) return;
      try {
        if (pipPlaying) {
          await platform.executeJavaScript(pipTabId, PAUSE_VIDEO_JS);
          pipPlaying = false;
        } else {
          await platform.executeJavaScript(pipTabId, PLAY_VIDEO_JS);
          pipPlaying = true;
        }
        events.emit(PIP_PLAY_STATE_CHANGED, { playing: pipPlaying });
      } catch {
        // tab may be destroyed
      }
    });

    commands.handle(PIP_RETURN_TO_TAB, async () => {
      if (!pipTabId) return;
      const tabId = pipTabId;
      dismissPip();
      await commands.send("tabs:activate", { tabId });
    });

    // ── Event listeners ─────────────────────────────────────────

    events.on("tabs:activated", (payload: TabsActivatedEvent) => {
      const { previousTabId, tabId } = payload;

      // If the activated tab is the PiP source, dismiss PiP
      if (pipTabId && tabId === pipTabId) {
        dismissPip();
        return;
      }

      // Check if previous tab has a playing video
      if (!previousTabId) return;
      if (pipTabId === previousTabId) return;

      platform
        .executeJavaScript(previousTabId, DETECT_VIDEO_JS)
        .then((hasVideo) => {
          if (!hasVideo) return;
          if (pipTabId === previousTabId) return;
          if (deps.getActiveTabId() === previousTabId) return;

          // Enter native PiP via the browser's built-in API (userGesture=true to bypass activation requirement)
          return platform.executeJavaScript(previousTabId, ENTER_PIP_JS, true).then((entered) => {
            if (!entered) return;
            pipTabId = previousTabId;
            pipPlaying = true;
            events.emit(PIP_ACTIVATED, { tabId: previousTabId });
          });
        })
        .catch(() => {});
    });

    events.on("tabs:closed", (payload: TabsClosedEvent) => {
      if (pipTabId && payload.tabId === pipTabId) {
        pipTabId = undefined;
        events.emit(PIP_DEACTIVATED, undefined);
      }
    });
  },
});
