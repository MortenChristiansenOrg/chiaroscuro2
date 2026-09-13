import { contextBridge, ipcRenderer } from "electron";

export const api = {
  platform: "electron" as const,

  /** Send a command to main process, returns response */
  sendCommand: async (name: string, payload: unknown): Promise<unknown> => {
    const result = await ipcRenderer.invoke("bus:command", name, payload);
    // Electron discards custom Error properties across IPC; reject a structured cloneable object.
    if (!result.ok) throw result.error;
    return result.response;
  },

  /** Subscribe to events from main process */
  onEvent: (name: string, callback: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, eventPayload: unknown) => {
      callback(eventPayload);
    };
    ipcRenderer.on(`bus:event:${name}`, listener);
    return () => {
      ipcRenderer.removeListener(`bus:event:${name}`, listener);
    };
  },

  /** Get current platform */
  getPlatformName: (): string => process.platform,

  /** Signal that renderer subscriptions are ready for events */
  signalReady: (): void => {
    ipcRenderer.send("renderer:ready");
  },
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld("chiaroscuro", api);
