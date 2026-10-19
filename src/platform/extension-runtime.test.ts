import { beforeEach, expect, it, vi } from "vitest";
import type { TabId } from "../shared/types";

type Reply = { ok: boolean; value?: unknown; error?: string };
const hooks = vi.hoisted(() => ({
  calls: new Map<string, (event: unknown, method: string, args: unknown[]) => Promise<Reply>>(),
  events: new Map<string, (event: unknown) => void>(),
  notifications: [] as { emit(name: string): boolean; close: ReturnType<typeof vi.fn> }[],
  windows: [] as Electron.BrowserWindow[],
  workAreas: [] as Electron.Rectangle[],
  leave: true,
  closeWhileLoading: false,
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
    url = "";
    webContents = Object.assign(new EventEmitter(), {
      id: hooks.windows.length + 200,
      audioMuted: false,
      getURL: () => this.url,
      getTitle: () => "Bitwarden",
      isLoading: () => false,
      isCurrentlyAudible: () => false,
    });
    removeMenu = vi.fn();
    loadURL = vi.fn(async (url: string) => {
      this.url = url;
      if (hooks.closeWhileLoading) this.close();
    });
    show = vi.fn();
    showInactive = vi.fn();
    focus = vi.fn();
    bounds = { x: 720, y: 220, width: 480, height: 600 };
    setBounds = vi.fn((bounds: Electron.Rectangle) => {
      this.bounds = bounds;
    });
    isFocused = () => true;
    isMaximized = () => false;
    isDestroyed = () => this.destroyed;
    getBounds = () => ({ ...this.bounds });
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
    screen: { getAllDisplays: () => hooks.workAreas.map((workArea) => ({ workArea })) },
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
  hooks.workAreas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  hooks.leave = true;
  hooks.closeWhileLoading = false;
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
  expect(created).toMatchObject({ ok: true, value: { type: "popup", tabs: [{ index: 0 }] } });
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
it("gives an extension window one tab that only its extension can find, focus and close", async () => {
  const { EventEmitter } = await import("node:events");
  const main = {
    id: 1,
    isFocused: () => true,
    isDestroyed: () => false,
    getBounds: () => ({}),
    isMaximized: () => false,
  } as unknown as Electron.BrowserWindow;
  const runtime = new ExtensionRuntime(
    { create: async () => "tab" as TabId, activate: async () => {}, close: vi.fn() },
    () => main,
  );
  const page = Object.assign(new EventEmitter(), {
    id: 10,
    mainFrame: { framesInSubtree: [] },
    isDestroyed: () => false,
    getURL: () => "https://example.test/",
    getTitle: () => "Example",
    isLoading: () => false,
    isCurrentlyAudible: () => false,
  }) as unknown as Electron.WebContents;
  runtime.addTab("tab" as TabId, page, main);
  runtime.selectTab("tab" as TabId);
  const call = hooks.calls.get("extension-browser:call");
  if (!call) throw new Error("No browser API handler");
  const frame = (id: string, page = "popup/index.html") => ({
    url: `chrome-extension://${id}/${page}`,
    send: vi.fn(),
  });
  const id = "a".repeat(32);
  const opener = { sender: { session: session.defaultSession }, senderFrame: frame(id) };
  const other = { sender: { session: session.defaultSession }, senderFrame: frame("b".repeat(32)) };
  hooks.events.get("extension-browser:subscribe")?.(opener);
  hooks.events.get("extension-browser:subscribe")?.(other);
  const url = `chrome-extension://${id}/popup/index.html?uilocation=popout&singleActionPopout=add`;
  await call(opener, "windows.create", [{ type: "popup", url, width: 380, height: 630 }]);
  const popout = hooks.windows[0];
  if (!popout) throw new Error("No extension window");
  const tabId = popout.webContents.id;
  const tab = { id: tabId, windowId: popout.id, index: 0, active: true, url };
  expect(opener.senderFrame.send).toHaveBeenCalledWith(
    "extension-browser:event",
    "tabs.onCreated",
    [expect.objectContaining(tab)],
  );
  expect(other.senderFrame.send).not.toHaveBeenCalled();

  // Bitwarden finds its single-action pop-outs by URL, then acts through the tab's window.
  const query = (caller: typeof opener, info: unknown) => call(caller, "tabs.query", [info]);
  const pattern = `chrome-extension://${id}/popup/index.html*`;
  expect(await query(opener, { url: pattern })).toEqual({
    ok: true,
    value: [expect.objectContaining(tab)],
  });
  expect(await call(opener, "tabs.get", [tabId])).toMatchObject({ ok: true, value: tab });
  const inside = {
    sender: Object.assign(popout.webContents, { session: session.defaultSession }),
    senderFrame: frame(id, "popup/index.html?uilocation=popout&singleActionPopout=add"),
  };
  expect(await call(inside, "tabs.getCurrent", [])).toMatchObject({ ok: true, value: tab });
  expect(await call(opener, "windows.getAll", [{ populate: true }])).toMatchObject({
    ok: true,
    value: [{ id: 1 }, { id: popout.id, type: "popup", tabs: [tab] }],
  });
  const ids = async (caller: typeof opener, info: unknown) =>
    ((await query(caller, info)).value as { id: number }[]).map((tab) => tab.id);
  expect(await ids(opener, {})).toEqual([10, tabId]);
  expect(await ids(opener, { active: true })).toEqual([10, tabId]);
  expect(await ids(opener, { windowType: "popup" })).toEqual([tabId]);
  expect(await ids(opener, { windowType: "normal" })).toEqual([10]);
  expect(await ids(opener, { windowId: popout.id })).toEqual([tabId]);
  // Current-window queries still mean the browser window, even from inside the pop-out.
  expect(await ids(inside, { active: true, currentWindow: true })).toEqual([10]);
  expect(await ids(inside, { active: true, windowId: -2 })).toEqual([10]);

  // Other extensions cannot see, focus or close it.
  expect(await ids(other, {})).toEqual([10]);
  expect(await query(other, { url: pattern })).toEqual({ ok: true, value: [] });
  expect(await call(other, "windows.getAll", [])).toMatchObject({ value: [{ id: 1 }] });
  for (const [method, args] of [
    ["tabs.get", [tabId]],
    ["tabs.update", [tabId, { active: true }]],
    ["tabs.remove", [tabId]],
    ["windows.update", [popout.id, { focused: true }]],
  ] as const)
    expect(await call(other, method, [...args])).toMatchObject({ ok: false });
  expect(popout.focus).not.toHaveBeenCalled();
  expect(popout.isDestroyed()).toBe(false);

  // Opening the same single-action pop-out again focuses the existing one.
  expect(
    await call(opener, "windows.update", [
      popout.id,
      { focused: true, width: 380, height: 630, top: Number.NaN, left: Number.NaN },
    ]),
  ).toMatchObject({ ok: true, value: { id: popout.id } });
  expect(popout.focus).toHaveBeenCalledOnce();
  // Its position is still unknown (NaN), so only the size changes.
  expect(popout.getBounds()).toEqual({ x: 720, y: 220, width: 380, height: 630 });
  expect(await call(opener, "tabs.update", [tabId, { active: true }])).toMatchObject({
    ok: true,
    value: tab,
  });
  expect(popout.focus).toHaveBeenCalledTimes(2);

  popout.webContents.emit("did-navigate-in-page", {}, `${url}#/add`, true);
  expect(opener.senderFrame.send).toHaveBeenCalledWith(
    "extension-browser:event",
    "tabs.onUpdated",
    [tabId, { url, status: "complete" }, expect.objectContaining(tab)],
  );

  // Cancelling closes the pop-out through its tab.
  expect(await call(inside, "tabs.remove", [tabId])).toEqual({ ok: true });
  expect(popout.isDestroyed()).toBe(true);
  expect(opener.senderFrame.send).toHaveBeenCalledWith(
    "extension-browser:event",
    "tabs.onRemoved",
    [tabId, { windowId: popout.id, isWindowClosing: true }],
  );
  expect(other.senderFrame.send).not.toHaveBeenCalled();
  expect(await ids(opener, {})).toEqual([10]);
  expect(await call(opener, "tabs.get", [tabId])).toMatchObject({ ok: false });
});
// Regression for #119: Bitwarden opens its pop-out at the browser window's top right.
it("reports window positions as left and top and keeps placed extension windows on screen", async () => {
  const { EventEmitter } = await import("node:events");
  hooks.workAreas = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 2560, height: 1400 },
  ];
  const main = {
    id: 1,
    isFocused: () => true,
    isDestroyed: () => false,
    getBounds: () => ({ x: 1920, y: 40, width: 1600, height: 1000 }),
    isMaximized: () => false,
    setBounds: vi.fn(),
  } as unknown as Electron.BrowserWindow;
  const runtime = new ExtensionRuntime(
    { create: async () => "tab" as TabId, activate: async () => {}, close: vi.fn() },
    () => main,
  );
  const page = Object.assign(new EventEmitter(), {
    id: 10,
    mainFrame: { framesInSubtree: [] },
    isDestroyed: () => false,
    getURL: () => "https://example.test/",
    getTitle: () => "Example",
    isLoading: () => false,
    isCurrentlyAudible: () => false,
  }) as unknown as Electron.WebContents;
  runtime.addTab("tab" as TabId, page, main);
  runtime.selectTab("tab" as TabId);
  const call = hooks.calls.get("extension-browser:call");
  if (!call) throw new Error("No browser API handler");
  const opener = {
    sender: { session: session.defaultSession },
    senderFrame: { url: `chrome-extension://${"a".repeat(32)}/popup.html`, send: vi.fn() },
  };

  const current = await call(opener, "windows.getCurrent", [{}]);
  expect(current).toMatchObject({
    ok: true,
    value: { id: 1, left: 1920, top: 40, width: 1600, height: 1000 },
  });
  expect(current.value).not.toHaveProperty("x");
  expect(current.value).not.toHaveProperty("y");

  // Bitwarden: left = window.left + window.width - 380 - 15, top = window.top + 90.
  const created = await call(opener, "windows.create", [
    {
      type: "popup",
      url: "popup.html?uilocation=popout",
      left: 3125,
      top: 130,
      width: 380,
      height: 630,
    },
  ]);
  const popout = hooks.windows[0];
  if (!popout) throw new Error("No extension window");
  expect(created).toMatchObject({
    ok: true,
    value: { id: popout.id, left: 3125, top: 130, width: 380, height: 630 },
  });
  expect(popout.setBounds).toHaveBeenCalledOnce();
  expect(created.value).not.toHaveProperty("x");

  const place = async (bounds: Record<string, number>) =>
    (await call(opener, "windows.update", [popout.id, bounds])).value;
  // Off every display, it lands at the nearest edge of the nearest display.
  expect(await place({ left: -5000, top: 5000 })).toMatchObject({
    left: 0,
    top: 410,
    width: 380,
    height: 630,
  });
  // Across two displays, it moves onto the one it overlaps most.
  expect(await place({ left: 1700, top: 100, width: 600 })).toMatchObject({
    left: 1920,
    top: 100,
    width: 600,
  });
  // Larger than the display, it shrinks to its work area.
  expect(await place({ width: 4000, height: 4000 })).toMatchObject({
    left: 1920,
    top: 0,
    width: 2560,
    height: 1400,
  });

  // Without a position, Electron's default placement stands.
  await call(opener, "windows.create", [{ url: "popup.html", width: 380, height: 630 }]);
  expect(hooks.windows[1]?.setBounds).not.toHaveBeenCalled();

  // Extensions cannot move the browser window.
  expect(await call(opener, "windows.update", [1, { left: 0, top: 0 }])).toMatchObject({
    ok: false,
  });
  expect(main.setBounds).not.toHaveBeenCalled();
});
it("never announces an extension window that closes while it loads", async () => {
  new ExtensionRuntime(
    { create: async () => "tab" as TabId, activate: async () => {}, close: async () => {} },
    () => undefined,
  );
  const call = hooks.calls.get("extension-browser:call");
  if (!call) throw new Error("No browser API handler");
  const opener = {
    sender: { session: session.defaultSession },
    senderFrame: { url: `chrome-extension://${"a".repeat(32)}/popup.html`, send: vi.fn() },
  };
  hooks.events.get("extension-browser:subscribe")?.(opener);
  hooks.closeWhileLoading = true;
  expect(await call(opener, "windows.create", [{ url: "popup.html" }])).toMatchObject({
    ok: false,
  });
  hooks.windows[0]?.webContents.emit("did-stop-loading");
  expect(opener.senderFrame.send).not.toHaveBeenCalled();
  expect(await call(opener, "tabs.query", [{}])).toEqual({ ok: true, value: [] });
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
