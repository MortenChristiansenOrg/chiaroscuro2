import { beforeEach, expect, it, vi } from "vitest";
import type { TabId } from "../shared/types";

type Reply = { ok: boolean; value?: unknown; error?: string };
const hooks = vi.hoisted(() => ({
  calls: new Map<string, (event: unknown, method: string, args: unknown[]) => Promise<Reply>>(),
  events: new Map<string, (event: unknown) => void>(),
  notifications: [] as { emit(name: string): boolean; close: ReturnType<typeof vi.fn> }[],
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Notification extends EventEmitter {
    static isSupported() {
      return true;
    }
    close = vi.fn();
    show = vi.fn();
    constructor() {
      super();
      hooks.notifications.push(this);
    }
  }
  return {
    Notification,
    BrowserWindow: {},
    webContents: {},
    ipcMain: {
      handle: (
        name: string,
        callback: (event: unknown, method: string, args: unknown[]) => Promise<Reply>,
      ) => hooks.calls.set(name, callback),
      on: (name: string, callback: (event: unknown) => void) => hooks.events.set(name, callback),
    },
    session: {
      defaultSession: {
        serviceWorkers: { on: vi.fn() },
        registerPreloadScript: vi.fn(),
        extensions: {
          on: vi.fn(),
          getExtension: (id: string) => ({ id, manifest: { permissions: ["notifications"] } }),
        },
      },
    },
  };
});

import { session } from "electron";
import { ExtensionRuntime } from "./extension-runtime";

beforeEach(() => {
  hooks.calls.clear();
  hooks.events.clear();
  hooks.notifications.length = 0;
});
it("keeps replacement notifications tracked when an older close event arrives", async () => {
  new ExtensionRuntime(
    { create: async () => "tab" as TabId, activate: async () => {}, close: async () => {} },
    () => undefined,
  );
  const send = vi.fn();
  const event = {
    sender: { session: session.defaultSession },
    senderFrame: { url: `chrome-extension://${"a".repeat(32)}/popup.html`, send },
  };
  hooks.events.get("extension-browser:subscribe")?.(event);
  const call = hooks.calls.get("extension-browser:call");
  if (!call) throw new Error("No browser API handler");
  const options = { title: "Title", message: "Message" };
  expect(await call(event, "notifications.create", ["same", options])).toEqual({
    ok: true,
    value: "same",
  });
  await call(event, "notifications.create", ["same", options]);
  const old = hooks.notifications[0],
    replacement = hooks.notifications[1];
  expect(old?.close).toHaveBeenCalledOnce();
  old?.emit("close");
  expect(send).not.toHaveBeenCalled();
  expect(await call(event, "notifications.getAll", [])).toEqual({
    ok: true,
    value: { same: true },
  });
  expect(await call(event, "notifications.clear", ["same"])).toEqual({ ok: true, value: true });
  expect(replacement?.close).toHaveBeenCalledOnce();
  replacement?.emit("close");
  expect(send).toHaveBeenCalledExactlyOnceWith(
    "extension-browser:event",
    "notifications.onClosed",
    ["same", false],
  );
  expect(await call(event, "notifications.getAll", [])).toEqual({ ok: true, value: {} });
});
