/// <reference types="vite/client" />

interface Window {
  chiaroscuro: {
    platform: "electron";
    sendCommand: (name: string, payload: unknown) => Promise<unknown>;
    onEvent: (name: string, callback: (payload: unknown) => void) => () => void;
    getPlatformName: () => string;
    signalReady: () => void;
  };
}
