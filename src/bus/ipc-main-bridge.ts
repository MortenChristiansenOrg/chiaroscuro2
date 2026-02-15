import { type BrowserWindow, ipcMain } from "electron";
import type { CommandBus } from "./command-bus";
import type { EventBus } from "./event-bus";
import type { CommandRegistry, EventRegistry } from "./types";

/**
 * Bridges bus ↔ IPC:
 * - Commands from renderer → ipcMain.handle → CommandBus.send
 * - EventBus.emit → webContents.send to all windows
 */
export function bridgeBusToIpc<C extends CommandRegistry, E extends EventRegistry>(
  commandBus: CommandBus<C>,
  eventBus: EventBus<E>,
  getWindows: () => BrowserWindow[],
): void {
  // Forward commands from renderer to command bus (with allowlist check)
  ipcMain.handle("bus:command", async (_event, name: string, payload: unknown) => {
    if (!commandBus.hasHandler(name)) {
      throw new Error(`Unknown command from renderer: "${name}"`);
    }
    return commandBus.send(name as string & keyof C, payload as C[string & keyof C]["payload"]);
  });

  // Patch EventBus.emit to also broadcast to renderer windows
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = <K extends string & keyof E>(name: K, payload: E[K]): void => {
    originalEmit(name, payload);
    for (const win of getWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(`bus:event:${name}`, payload);
      }
    }
  };
}
