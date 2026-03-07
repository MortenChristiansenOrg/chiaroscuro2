import { vi } from "vitest";
import { MockDataTransfer } from "./mock-data-transfer";

// Mock window.chiaroscuro API exposed by preload script
const mockSendCommand = vi.fn(() => Promise.resolve());
const mockOnEvent = vi.fn(() => () => {});
const mockGetPlatformName = vi.fn(() => "linux");
const mockSignalReady = vi.fn();

Object.defineProperty(window, "chiaroscuro", {
  value: {
    platform: "electron" as const,
    sendCommand: mockSendCommand,
    onEvent: mockOnEvent,
    getPlatformName: mockGetPlatformName,
    signalReady: mockSignalReady,
  },
  writable: true,
  configurable: true,
});

// jsdom lacks DataTransfer
Object.defineProperty(globalThis, "DataTransfer", {
  value: MockDataTransfer,
  writable: true,
  configurable: true,
});
