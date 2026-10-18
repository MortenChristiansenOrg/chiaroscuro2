import { beforeEach, expect, it, vi } from "vitest";
import type { TabId } from "../shared/types";

type Reply = { ok: boolean; value?: unknown; error?: string };
const hooks = vi.hoisted(() => ({
  calls: new Map<string, (event: unknown, method: string, args: unknown[]) => Promise<Reply>>(),
  events: new Map<string, (event: unknown) => void>(),
  notifications: [] as { emit(name: string): boolean; close: ReturnType<typeof vi.fn> }[],
  windows: [] as Electron.BrowserWindow[],
  leave: true,
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
  // Closing runs beforeunload first: a vetoed close only proceeds if a listener prevents the veto.
  class BrowserWindow extends EventEmitter {
    static fromId = (id: number) => hooks.windows.find((window) => window.id === id) ?? null;
    static fromWebContents = (contents: unknown) =>
      hooks.windows.find((window) => window.webContents === contents) ?? null;
    id = hooks.windows.length + 100;
    destroyed = false;
    vetoUnload = false;
    webContents = new EventEmitter();
    removeMenu = vi.fn();
    loadURL = vi.fn(async () => {});
    show = vi.fn();
    showInactive = vi.fn();
    isFocused = () => true;
    isMaximized = () => false;
    isDestroyed = () => this.destroyed;
    getBounds = () => ({ left: 0, top: 0, width: 480, height: 600 });
    constructor() {
      super();
      hooks.windows.push(this as unknown as Electron.BrowserWindow);
    }
    close() {
      if (this.vetoUnload) {
        let allowed = false;
        this.webContents.emit("will-prevent-unload", {
          preventDefault: () => {
            allowed = true;
          },
        });
        if (!allowed) return;
      }
      this.destroyed = true;
      this.emit("closed");
    }
  }
  return {
    Notification,
    BrowserWindow,
    dialog: { showMessageBoxSync: vi.fn(() => (hooks.leave ? 0 : 1)) },
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

import { dialog, session } from "electron";
import { ExtensionRuntime } from "./extension-runtime";

beforeEach(() => {
  hooks.calls.clear();
  hooks.events.clear();
  hooks.notifications.length = 0;
  hooks.windows.length = 0;
  hooks.leave = true;
  vi.mocked(dialog.showMessageBoxSync).mockClear();
});

it("lets an extension close its own popup window from inside it, after confirming a beforeunload veto", async () => {
  const main = { id: 1, isDestroyed: () => false } as unknown as Electron.BrowserWindow;
  new ExtensionRuntime(
    { create: async () => "tab" as TabId, activate: async () => {}, close: async () => {} },
    () => main,
  );
  const call = hooks.calls.get("extension-browser:call");
  if (!call) throw new Error("No browser API handler");
  const id = "a".repeat(32);
  const opener = {
    sender: { session: session.defaultSession },
    senderFrame: { url: `chrome-extension://${id}/popup.html`, send: vi.fn() },
  };
  const created = await call(opener, "windows.create", [
    { type: "popup", url: "popup.html?uilocation=popout", width: 480, height: 630 },
  ]);
  expect(created).toMatchObject({ ok: true, value: { type: "popup", tabs: [] } });
  const popout = hooks.windows[0];
  if (!popout) throw new Error("No extension window");
  // Browser accelerators in the application menu act on the main window, not this one.
  expect(popout.removeMenu).toHaveBeenCalledOnce();
  const inside = {
    sender: Object.assign(popout.webContents, { session: session.defaultSession }),
    senderFrame: { url: `chrome-extension://${id}/popup.html?uilocation=popout`, send: vi.fn() },
  };
  // Bitwarden closes its pop-out with windows.remove((await windows.getCurrent()).id).
  const current = await call(inside, "windows.getCurrent", [{ populate: true }]);
  expect(current).toMatchObject({ ok: true, value: { id: popout.id, type: "popup" } });
  expect(await call(inside, "windows.get", [popout.id])).toEqual(current);
  const other = {
    ...opener,
    senderFrame: { url: `chrome-extension://${"b".repeat(32)}/popup.html`, send: vi.fn() },
  };
  expect(await call(other, "windows.get", [popout.id])).toEqual({
    ok: false,
    error: "No such browser window",
  });
  expect(await call(other, "windows.remove", [popout.id])).toMatchObject({ ok: false });

  // The page warns about unsaved changes: staying keeps the window, leaving closes it.
  Object.assign(popout, { vetoUnload: true });
  hooks.leave = false;
  expect(await call(inside, "windows.remove", [popout.id])).toEqual({ ok: true });
  expect(dialog.showMessageBoxSync).toHaveBeenCalledWith(
    popout,
    expect.objectContaining({ message: "Leave this page?", buttons: ["Leave", "Stay"] }),
  );
  expect(popout.isDestroyed()).toBe(false);
  hooks.leave = true;
  popout.close();
  expect(popout.isDestroyed()).toBe(true);
  expect(await call(inside, "windows.remove", [popout.id])).toMatchObject({ ok: false });
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
