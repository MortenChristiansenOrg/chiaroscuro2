import { contextBridge } from "electron";

// Stub for future bus IPC bridge
contextBridge.exposeInMainWorld("chiaroscuro", {
  platform: "electron",
});
