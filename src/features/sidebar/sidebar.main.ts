import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import {
  SIDEBAR_TOGGLE,
  SIDEBAR_VISIBILITY_CHANGED,
  type SidebarCommands,
  type SidebarEvents,
} from "./sidebar.shared";

interface Deps {
  commands: CommandBus<SidebarCommands>;
  events: EventBus<SidebarEvents>;
  platform: Platform;
}

let visible = true;

export default defineFeature<Deps>({
  register({ commands, events, platform }) {
    visible = true;

    commands.handle(SIDEBAR_TOGGLE, async () => {
      visible = !visible;
      events.emit(SIDEBAR_VISIBILITY_CHANGED, { visible });
    });

    platform.registerShortcut("CommandOrControl+S", () => {
      commands.send(SIDEBAR_TOGGLE, undefined).catch(console.error);
    });
  },

  start({ events }) {
    events.emit(SIDEBAR_VISIBILITY_CHANGED, { visible });
  },
});
