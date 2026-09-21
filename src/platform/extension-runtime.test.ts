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
        serviceWorkers: { on: vi.fn(), startWorkerForScope: vi.fn() },
        registerPreloadScript: vi.fn(),
        extensions: {
          on: vi.fn(),
          getAllExtensions: vi.fn(() => []),
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

it("reports conflicts and dispatches commands only to the selected focused tab", async () => {
  const { EventEmitter } = await import("node:events");
  const ext = {
    id: "a".repeat(32),
    manifest: {
      permissions: ["tabs", "webNavigation"],
      commands: {
        fill: { suggested_key: { default: "Ctrl+Shift+L" } },
        conflict: { suggested_key: { default: "Ctrl+T" } },
        _execute_action: { suggested_key: { default: "Ctrl+Shift+Y" } },
      },
      action: { default_popup: "popup.html" },
    },
  };
  const getExtension = vi
    .spyOn(session.defaultSession.extensions, "getExtension")
    .mockReturnValue(ext as Electron.Extension);
  const getAll = vi
    .spyOn(session.defaultSession.extensions, "getAllExtensions")
    .mockReturnValue([ext as Electron.Extension]);
  const openPopup = vi.fn();
  const runtime = new ExtensionRuntime(
    { create: async () => "tab" as TabId, activate: async () => {}, close: async () => {} },
    () => undefined,
    { reserved: () => ["Control+T"], openPopup },
  );
  const frame = Object.assign(new EventEmitter(), {
    url: "https://example.test/",
    framesInSubtree: [] as unknown[],
    detached: false,
  });
  frame.framesInSubtree.push(frame);
  const contents = Object.assign(new EventEmitter(), {
    id: 10,
    mainFrame: frame,
    isDestroyed: () => false,
    getURL: () => frame.url,
    getTitle: () => "Example",
    isLoading: () => false,
    isCurrentlyAudible: () => false,
  }) as unknown as Electron.WebContents;
  const window = {
    id: 1,
    webContents: {},
    isFocused: vi.fn(() => true),
    isDestroyed: () => false,
    getBounds: () => ({}),
    isMaximized: () => false,
  } as unknown as Electron.BrowserWindow;
  runtime.addTab("tab" as TabId, contents, window);
  runtime.selectTab("tab" as TabId);
  const send = vi.fn();
  const event = {
    sender: { session: session.defaultSession },
    senderFrame: { url: `chrome-extension://${ext.id}/popup.html`, send },
  };
  hooks.events.get("extension-browser:subscribe")?.(event);
  const commands = await hooks.calls.get("extension-browser:call")?.(event, "commands.getAll", []);
  expect(commands?.value).toEqual([
    { name: "fill", description: "", shortcut: "Ctrl+Shift+L" },
    { name: "conflict", description: "", shortcut: "" },
    { name: "_execute_action", description: "", shortcut: "Ctrl+Shift+Y" },
  ]);
  const input = {
    type: "keyDown",
    key: "L",
    code: "KeyL",
    control: true,
    shift: true,
    alt: false,
    meta: false,
  } as Electron.Input;
  expect(runtime.handleCommand(contents, input)).toBe(true);
  expect(send).toHaveBeenCalledWith("extension-browser:event", "commands.onCommand", [
    "fill",
    expect.objectContaining({ id: 10, url: frame.url }),
  ]);
  send.mockClear();
  expect(runtime.handleCommand(contents, { ...input, isAutoRepeat: true })).toBe(false);
  expect(runtime.handleCommand(contents, { ...input, type: "keyUp" })).toBe(false);
  expect(runtime.handleCommand({} as Electron.WebContents, input)).toBe(false);
  vi.mocked(window.isFocused).mockReturnValue(false);
  expect(runtime.handleCommand(contents, input)).toBe(false);
  vi.mocked(window.isFocused).mockReturnValue(true);
  expect(runtime.handleCommand(contents, { ...input, key: "Y" })).toBe(true);
  expect(openPopup).toHaveBeenCalledWith(ext.id, "popup.html");
  runtime.selectTab(undefined);
  expect(runtime.handleCommand(contents, input)).toBe(false);
  expect(send).not.toHaveBeenCalledWith(
    "extension-browser:event",
    "commands.onCommand",
    expect.anything(),
  );
  // A worker wake-up must not deliver a command to a replacement document, even at the same URL.
  runtime.selectTab("tab" as TabId);
  Object.assign(ext.manifest, { background: { service_worker: "worker.js" } });
  let wake!: (host: Electron.ServiceWorkerMain) => void;
  vi.mocked(session.defaultSession.serviceWorkers.startWorkerForScope).mockImplementation(
    () =>
      new Promise((resolve) => {
        wake = resolve;
      }),
  );
  send.mockClear();
  expect(runtime.handleCommand(contents, input)).toBe(true);
  wake(event.senderFrame as unknown as Electron.ServiceWorkerMain);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(send).not.toHaveBeenCalled();
  contents.emit("did-start-navigation", {}, frame.url, false, true);
  await hooks.calls.get("extension-browser:call")?.(event, "commands.listen", [true]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(send).not.toHaveBeenCalledWith(
    "extension-browser:event",
    "commands.onCommand",
    expect.anything(),
  );

  const child = Object.assign(new EventEmitter(), {
    url: "https://frame.test/",
    parent: frame,
    frameTreeNodeId: 21,
    processId: 2,
    routingId: 3,
    detached: false,
  });
  const nested = Object.assign(new EventEmitter(), {
    url: "https://nested.test/",
    parent: child,
    frameTreeNodeId: 22,
    processId: 2,
    routingId: 4,
    detached: false,
  });
  frame.framesInSubtree.push(child, nested);
  contents.emit("frame-created", {}, { frame: nested });
  nested.emit("dom-ready");
  expect(send).toHaveBeenCalledWith("extension-browser:event", "webNavigation.onDOMContentLoaded", [
    expect.objectContaining({ frameId: 22, parentFrameId: 21, url: nested.url }),
  ]);
  contents.emit("did-navigate-in-page", {}, nested.url, false, 2, 4);
  expect(send).toHaveBeenCalledWith(
    "extension-browser:event",
    "webNavigation.onHistoryStateUpdated",
    [expect.objectContaining({ frameId: 22, parentFrameId: 21 })],
  );
  expect(
    await hooks.calls.get("extension-browser:call")?.(event, "webNavigation.getFrame", [
      { tabId: 10, frameId: 22 },
    ]),
  ).toEqual({
    ok: true,
    value: { frameId: 22, parentFrameId: 21, url: nested.url, errorOccurred: false },
  });
  nested.detached = true;
  expect(
    await hooks.calls.get("extension-browser:call")?.(event, "webNavigation.getFrame", [
      { tabId: 10, frameId: 22 },
    ]),
  ).toEqual({ ok: true, value: null });
  getAll.mockReturnValue([]);
  expect(runtime.handleCommand(contents, input)).toBe(false);
  getExtension.mockRestore();
  getAll.mockRestore();
});
