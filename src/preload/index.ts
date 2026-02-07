import { contextBridge, ipcRenderer } from "electron";

export const api = {
  platform: "electron" as const,

  /** Send a command to main process, returns response */
  sendCommand: (name: string, payload: unknown): Promise<unknown> =>
    ipcRenderer.invoke("bus:command", name, payload),

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
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld("chiaroscuro", api);
