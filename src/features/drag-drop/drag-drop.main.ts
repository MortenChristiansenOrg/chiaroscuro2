import { pathToFileURL } from "node:url";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import { TABS_CREATE, type TabsCommands } from "../tabs/tabs.shared";
import {
  DRAG_DROP_FILES_DROPPED,
  DRAG_DROP_OPEN_FILES,
  type DragDropCommands,
  type DragDropEvents,
  isSupportedFile,
} from "./drag-drop.shared";

type AllCommands = DragDropCommands & TabsCommands;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<DragDropEvents>;
}

export function register({ commands, events }: Deps): void {
  commands.handle(DRAG_DROP_OPEN_FILES, async ({ filePaths }) => {
    const supported = filePaths.filter(isSupportedFile);
    if (supported.length === 0) return;

    const opened: string[] = [];
    let first = true;
    for (const filePath of supported) {
      try {
        const url = pathToFileURL(filePath).href;
        await commands.send(TABS_CREATE, { url, activate: first });
        opened.push(filePath);
        first = false;
      } catch {
        // Continue opening remaining files
      }
    }

    if (opened.length > 0) {
      events.emit(DRAG_DROP_FILES_DROPPED, { filePaths: opened });
    }
  });
}
