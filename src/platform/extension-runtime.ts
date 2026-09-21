import path from "node:path";
import {
  BrowserWindow,
  ipcMain,
  type MenuItemConstructorOptions,
  Notification,
  type ServiceWorkerMain,
  session,
  type WebContents,
  type WebFrameMain,
  webContents,
} from "electron";
import { z } from "zod";
import type { TabId } from "../shared/types";
import {
  commandChord,
  type ExtensionCommand,
  inputChord,
  suggestedShortcut,
} from "./extension-commands";
import { matchesUrl } from "./extension-match-pattern";
import type { ExtensionTabActions } from "./types";

type Host = WebFrameMain | ServiceWorkerMain;
type Caller = { extension: Electron.Extension; host: Host; contents?: WebContents };
type Tab = { id: TabId; contents: WebContents; window: BrowserWindow };
const object = z.record(z.string(), z.unknown());
const idSchema = z.number().int().nonnegative();
const menuSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    parentId: z.string().optional(),
    type: z.enum(["normal", "separator", "checkbox", "radio"]).optional(),
    contexts: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    checked: z.boolean().optional(),
    visible: z.boolean().optional(),
  })
  .passthrough();
type ExtensionMenu = z.infer<typeof menuSchema>;

/** Browser semantics missing from Electron; Chromium retains runtime, storage and scripting. */
export class ExtensionRuntime {
  private tabs = new Map<number, Tab>();
  private activeId: number | undefined;
  private navigationVersions = new WeakMap<WebContents, number>();
  private popupContents = new Set<number>();
  private contextIds = new WeakMap<WebFrameMain, string>();

  registerPopup(contents: WebContents): void {
    this.popupContents.add(contents.id);
    contents.once("destroyed", () => this.popupContents.delete(contents.id));
  }

  private contexts(extensionId: string, query: Record<string, unknown>) {
    const contexts: Record<string, unknown>[] = [];
    const contextId = (key: WebFrameMain) => {
      let value = this.contextIds.get(key);
      if (!value) {
        value = crypto.randomUUID();
        this.contextIds.set(key, value);
      }
      return value;
    };
    for (const contents of webContents.getAllWebContents()) {
      if (
        contents.isDestroyed() ||
        contents.session !== session.defaultSession ||
        (!this.popupContents.has(contents.id) &&
          !this.tabs.has(contents.id) &&
          ![...this.extensionWindows.values()].some(
            (entry) => entry.window.webContents === contents,
          ))
      )
        continue;
      for (const frame of contents.mainFrame.framesInSubtree) {
        if (!frame.url.startsWith(`chrome-extension://${extensionId}/`)) continue;
        const id = contextId(frame);
        contexts.push({
          contextId: id,
          documentId: id,
          contextType: this.popupContents.has(contents.id) ? "POPUP" : "TAB",
          documentUrl: frame.url,
          documentOrigin: `chrome-extension://${extensionId}`,
          frameId: frame === contents.mainFrame ? 0 : frame.frameTreeNodeId,
          tabId: this.tabs.has(contents.id) ? contents.id : -1,
          windowId: BrowserWindow.fromWebContents(contents)?.id ?? -1,
          incognito: false,
        });
      }
    }
    return contexts.filter((context) =>
      Object.entries(query).every(([key, value]) => {
        if (key === "incognito") return value === context.incognito;
        const property: Record<string, string> = {
          contextIds: "contextId",
          contextTypes: "contextType",
          documentIds: "documentId",
          documentOrigins: "documentOrigin",
          documentUrls: "documentUrl",
          frameIds: "frameId",
          tabIds: "tabId",
          windowIds: "windowId",
        };
        return !property[key] || (Array.isArray(value) && value.includes(context[property[key]]));
      }),
    );
  }

  private subscribers = new Map<Host, string>();
  private menus = new Map<string, Map<string, ExtensionMenu>>();
  private notifications = new Map<string, Notification>();
  private contextParams = new Map<number, Electron.ContextMenuParams>();
  private workerHandlers = new WeakSet<ServiceWorkerMain>();
  private commandListeners = new WeakSet<Host>();
  private commandWaiters = new Map<Host, Set<() => void>>();
  private extensionWindows = new Map<number, { extensionId: string; window: BrowserWindow }>();

  constructor(
    private readonly actions: ExtensionTabActions,
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly commandHost?: {
      reserved(): string[];
      openPopup(extensionId: string, popup: string): void;
    },
  ) {
    const ses = session.defaultSession;
    const caller = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): Caller => {
      if (event.sender.session !== ses) throw new Error("Wrong extension session");
      const frame = event.senderFrame;
      if (!frame) throw new Error("Missing extension frame");
      return this.identify(frame.url, frame, event.sender);
    };
    ipcMain.handle("extension-browser:call", (event, method, args) =>
      this.reply(() => this.dispatch(caller(event), method, args)),
    );
    ipcMain.on("extension-browser:subscribe", (event) => {
      try {
        const source = caller(event);
        this.subscribers.set(source.host, source.extension.id);
      } catch {
        /* Untrusted frames cannot subscribe. */
      }
    });
    ses.serviceWorkers.on("running-status-changed", (details) => {
      if (details.runningStatus !== "starting") return;
      const worker = ses.serviceWorkers.getWorkerFromVersionID(details.versionId);
      if (!worker?.scope.startsWith("chrome-extension://")) return;
      this.commandListeners.delete(worker);
      if (this.workerHandlers.has(worker)) return;
      this.workerHandlers.add(worker);
      worker.ipc.handle("extension-browser:call", (_event, method, args) =>
        this.reply(() => this.dispatch(this.identify(worker.scope, worker), method, args)),
      );
      worker.ipc.on("extension-browser:subscribe", () => {
        try {
          this.subscribers.set(worker, this.identify(worker.scope, worker).extension.id);
        } catch {
          /* Extension was removed during startup. */
        }
      });
    });
    for (const type of ["frame", "service-worker"] as const) {
      ses.registerPreloadScript({
        id: `extension-browser-${type}`,
        type,
        filePath: path.join(__dirname, "../preload/extension-api.js"),
      });
    }
    ses.extensions.on("extension-unloaded", (_event, extension) => {
      this.menus.delete(extension.id);
      for (const [key, notification] of this.notifications)
        if (key.startsWith(`${extension.id}:`)) {
          notification.close();
          this.notifications.delete(key);
        }
      for (const entry of this.extensionWindows.values())
        if (entry.extensionId === extension.id) entry.window.close();
      for (const [host, id] of this.subscribers)
        if (id === extension.id) this.subscribers.delete(host);
    });
  }

  private identify(url: string, host: Host, contents?: WebContents): Caller {
    const parsed = new URL(url);
    const extension =
      parsed.protocol === "chrome-extension:" &&
      session.defaultSession.extensions.getExtension(parsed.hostname);
    if (!extension) throw new Error("Only loaded extension origins can use browser APIs");
    return { extension, host, contents };
  }

  private async reply(run: () => unknown) {
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Extension API failed" };
    }
  }

  private emit(name: string, args: unknown[], extensionId?: string) {
    for (const [host, id] of this.subscribers) {
      if (extensionId && id !== extensionId) continue;
      if (name === "storage.workerChanged" && !("scope" in host)) continue;
      try {
        const source = this.identify("scope" in host ? host.scope : host.url, host);
        if (source.extension.id !== id) {
          this.subscribers.delete(host);
          continue;
        }
        if (
          name.startsWith("webNavigation.") &&
          !this.permissions(source.extension).permissions.includes("webNavigation")
        )
          continue;
        let payload = args;
        if (name === "tabs.onCreated")
          payload = [
            this.visibleTab(
              args[0] as ReturnType<ExtensionRuntime["tabDetails"]>,
              source.extension,
            ),
          ];
        if (name === "tabs.onUpdated") {
          const tab = args[2] as ReturnType<ExtensionRuntime["tabDetails"]>;
          const visible = this.visibleTab(tab, source.extension);
          const change = { ...(args[1] as Record<string, unknown>) };
          if (!("url" in visible)) {
            delete change.url;
            delete change.title;
          }
          payload = [args[0], change, visible];
        }
        if (name === "windows.onCreated") {
          const win = args[0] as ReturnType<ExtensionRuntime["windowDetails"]>;
          payload = [
            {
              ...win,
              tabs: win.tabs.map((tab) =>
                this.visibleTab(
                  tab as ReturnType<ExtensionRuntime["tabDetails"]>,
                  source.extension,
                ),
              ),
            },
          ];
        }
        host.send("extension-browser:event", name, payload);
      } catch {
        this.subscribers.delete(host);
      }
    }
  }

  addTab(id: TabId, contents: WebContents, window: BrowserWindow): void {
    const firstWindow = ![...this.tabs.values()].some((tab) => tab.window === window);
    this.tabs.set(contents.id, { id, contents, window });
    if (firstWindow) this.emit("windows.onCreated", [this.windowDetails(window)]);
    const updated = () =>
      this.emit("tabs.onUpdated", [
        contents.id,
        { url: contents.getURL(), status: contents.isLoading() ? "loading" : "complete" },
        this.tabDetails(contents.id),
      ]);
    contents.on("did-start-navigation", (_event, _url, inPlace) => {
      if (!inPlace)
        this.navigationVersions.set(contents, (this.navigationVersions.get(contents) ?? 0) + 1);
    });
    contents.on("did-start-loading", updated);
    contents.on("did-stop-loading", updated);
    contents.on("page-title-updated", updated);
    contents.on("context-menu", (_event, params) => this.contextParams.set(contents.id, params));
    const findFrame = (processId: number, routingId: number) =>
      contents.mainFrame.framesInSubtree.find(
        (frame) => frame.processId === processId && frame.routingId === routingId,
      );
    const watchFrame = (frame: WebFrameMain) => {
      frame.on("dom-ready", () => {
        if (!contents.isDestroyed() && !frame.detached)
          this.navigation("onDOMContentLoaded", contents, frame);
      });
    };
    for (const frame of contents.mainFrame.framesInSubtree) watchFrame(frame);
    contents.on("frame-created", (_event, { frame }) => {
      if (frame) watchFrame(frame);
    });
    contents.on(
      "did-frame-navigate",
      (_event, _url, _code, _status, _main, processId, routingId) => {
        const frame = findFrame(processId, routingId);
        if (frame) this.navigation("onCommitted", contents, frame);
      },
    );
    contents.on("did-frame-finish-load", (_event, _main, processId, routingId) => {
      const frame = findFrame(processId, routingId);
      if (frame) this.navigation("onCompleted", contents, frame);
    });
    contents.on("did-navigate-in-page", (_event, _url, main, processId, routingId) => {
      if (main) updated();
      const frame = findFrame(processId, routingId);
      if (frame) this.navigation("onHistoryStateUpdated", contents, frame);
    });
    contents.on("did-fail-load", (_event, _code, description, url, _main, processId, routingId) => {
      const frame = findFrame(processId, routingId);
      if (frame) this.navigation("onErrorOccurred", contents, frame, description, url);
    });
    contents.once("destroyed", () => {
      this.tabs.delete(contents.id);
      this.contextParams.delete(contents.id);
      if (this.activeId === contents.id) this.activeId = undefined;
      this.emit("tabs.onRemoved", [
        contents.id,
        { windowId: window.id, isWindowClosing: window.isDestroyed() },
      ]);
    });
    this.emit("tabs.onCreated", [this.tabDetails(contents.id)]);
  }

  selectTab(id: TabId | undefined): void {
    const tab = [...this.tabs.values()].find((tab) => tab.id === id);
    if (this.activeId === tab?.contents.id) return;
    this.activeId = tab?.contents.id;
    if (tab) this.emit("tabs.onActivated", [{ tabId: tab.contents.id, windowId: tab.window.id }]);
  }

  private frameDetails(contents: WebContents, frame: WebFrameMain) {
    return {
      frameId: frame === contents.mainFrame ? 0 : frame.frameTreeNodeId,
      parentFrameId:
        frame === contents.mainFrame
          ? -1
          : frame.parent === contents.mainFrame
            ? 0
            : (frame.parent?.frameTreeNodeId ?? -1),
      url: frame.url,
      errorOccurred: false,
    };
  }

  private navigation(
    name: string,
    contents: WebContents,
    frame: WebFrameMain,
    error?: string,
    url = frame.url,
  ) {
    this.emit(`webNavigation.${name}`, [
      {
        ...this.frameDetails(contents, frame),
        tabId: contents.id,
        url,
        timeStamp: Date.now(),
        ...(name === "onCommitted" || name === "onHistoryStateUpdated"
          ? { transitionType: "link", transitionQualifiers: [] }
          : {}),
        ...(error ? { error } : {}),
      },
    ]);
  }

  private tab(id: unknown): Tab {
    const tab = this.tabs.get(idSchema.parse(id));
    if (!tab || tab.contents.isDestroyed()) throw new Error("No such browser tab");
    return tab;
  }

  private tabDetails(id: number) {
    const { contents, window } = this.tab(id);
    return {
      id,
      windowId: window.id,
      index: [...this.tabs.keys()].indexOf(id),
      active: this.activeId === id,
      highlighted: this.activeId === id,
      url: contents.getURL(),
      title: contents.getTitle(),
      status: contents.isLoading() ? "loading" : "complete",
      incognito: false,
      pinned: false,
      audible: contents.isCurrentlyAudible(),
      discarded: false,
      mutedInfo: { muted: contents.audioMuted },
    };
  }

  private visibleTab(
    tab: ReturnType<ExtensionRuntime["tabDetails"]>,
    extension: Electron.Extension,
  ) {
    const permissions = this.permissions(extension);
    if (
      permissions.permissions.includes("tabs") ||
      permissions.origins.some((pattern) => matchesUrl(pattern, tab.url)) ||
      tab.url.startsWith(`chrome-extension://${extension.id}/`)
    )
      return tab;
    const { url: _url, title: _title, ...visible } = tab;
    return visible;
  }

  private windowDetails(window: BrowserWindow, extension?: Electron.Extension) {
    return {
      id: window.id,
      focused: window.isFocused(),
      type: "normal",
      incognito: false,
      ...window.getBounds(),
      state: window.isMaximized() ? "maximized" : "normal",
      tabs: [...this.tabs.values()]
        .filter((tab) => tab.window === window)
        .map((tab) =>
          extension
            ? this.visibleTab(this.tabDetails(tab.contents.id), extension)
            : this.tabDetails(tab.contents.id),
        ),
    };
  }

  private permissions(extension: Electron.Extension) {
    const manifest = extension.manifest as { permissions?: string[]; host_permissions?: string[] };
    return {
      permissions: manifest.permissions ?? [],
      origins: [
        ...(manifest.host_permissions ?? []),
        ...(manifest.permissions ?? []).filter(
          (value) => value.includes("://") || value === "<all_urls>",
        ),
      ],
    };
  }

  private async dispatch(caller: Caller, method: unknown, rawArgs: unknown): Promise<unknown> {
    const name = z.string().parse(method),
      args = z.array(z.unknown()).parse(rawArgs);
    const extId = caller.extension.id;
    const permission = name.startsWith("webNavigation.")
      ? "webNavigation"
      : name.startsWith("contextMenus.")
        ? "contextMenus"
        : name.startsWith("notifications.")
          ? "notifications"
          : undefined;
    if (permission && !this.permissions(caller.extension).permissions.includes(permission))
      throw new Error(`Missing extension permission: ${permission}`);
    switch (name) {
      case "runtime.getContexts":
        return this.contexts(extId, object.parse(args[0] ?? {}));
      case "storage.changed": {
        const changes = z
          .record(
            z.string(),
            z.object({ oldValue: z.unknown().optional(), newValue: z.unknown().optional() }),
          )
          .parse(args[0]);
        const area = z.enum(["local", "session"]).parse(args[1]);
        this.emit("storage.workerChanged", [changes, area], extId);
        return;
      }
      case "storage.managed.get":
        return args[0] && typeof args[0] === "object" && !Array.isArray(args[0])
          ? object.parse(args[0])
          : {};
      case "storage.managed.getBytesInUse":
        return 0;
      case "storage.managed.write":
        throw new Error("Managed storage is read-only");
      case "tabs.query": {
        const q = object.parse(args[0] ?? {});
        return [...this.tabs.keys()]
          .map((id) => this.visibleTab(this.tabDetails(id), caller.extension))
          .filter(
            (tab) =>
              (q.active === undefined || tab.active === q.active) &&
              (q.windowId === undefined || q.windowId === -2 || tab.windowId === q.windowId) &&
              (q.url === undefined ||
                (Array.isArray(q.url) ? q.url : [q.url]).some(
                  (pattern) =>
                    typeof pattern === "string" &&
                    "url" in tab &&
                    typeof tab.url === "string" &&
                    matchesUrl(pattern, tab.url),
                )),
          );
      }
      case "tabs.get":
        return this.visibleTab(this.tabDetails(this.tab(args[0]).contents.id), caller.extension);
      case "tabs.getCurrent":
        return caller.contents && this.tabs.has(caller.contents.id)
          ? this.visibleTab(this.tabDetails(caller.contents.id), caller.extension)
          : undefined;
      case "tabs.create": {
        const data = z
          .object({ url: z.string().optional(), active: z.boolean().optional() })
          .parse(args[0] ?? {});
        const id = await this.actions.create(
          this.navigationUrl(data.url ?? "about:blank", caller.extension),
          data.active !== false,
        );
        const tab = [...this.tabs.values()].find((tab) => tab.id === id);
        if (!tab) throw new Error("Extension tab could not be created");
        return this.visibleTab(this.tabDetails(tab.contents.id), caller.extension);
      }
      case "tabs.update": {
        const explicit = typeof args[0] === "number";
        const tab = this.tab(explicit ? args[0] : this.activeId);
        const data = z
          .object({
            url: z.string().optional(),
            active: z.boolean().optional(),
            muted: z.boolean().optional(),
          })
          .parse(args[explicit ? 1 : 0]);
        if (data.url) await tab.contents.loadURL(this.navigationUrl(data.url, caller.extension));
        if (data.muted !== undefined) tab.contents.audioMuted = data.muted;
        if (data.active) await this.actions.activate(tab.id);
        return this.visibleTab(this.tabDetails(tab.contents.id), caller.extension);
      }
      case "tabs.remove": {
        const ids = z.union([idSchema, z.array(idSchema)]).parse(args[0]);
        for (const id of Array.isArray(ids) ? ids : [ids])
          await this.actions.close(this.tab(id).id);
        return;
      }
      case "windows.getAll":
        return [...new Set([...this.tabs.values()].map((tab) => tab.window))]
          .filter((win) => !win.isDestroyed())
          .map((win) => this.windowDetails(win, caller.extension));
      case "windows.get":
      case "windows.getCurrent":
      case "windows.getLastFocused": {
        const win =
          name === "windows.get" && args[0] !== -2
            ? BrowserWindow.fromId(idSchema.parse(args[0]))
            : this.getWindow();
        if (!win || ![...this.tabs.values()].some((tab) => tab.window === win))
          throw new Error("No such browser window");
        return this.windowDetails(win, caller.extension);
      }
      case "windows.create": {
        const data = z
          .object({
            url: z.string(),
            focused: z.boolean().optional(),
            width: z.number().int().positive().max(4000).optional(),
            height: z.number().int().positive().max(4000).optional(),
          })
          .parse(args[0]);
        const url = this.navigationUrl(data.url, caller.extension);
        const win = new BrowserWindow({
          parent: this.getWindow(),
          width: data.width ?? 480,
          height: data.height ?? 600,
          show: false,
          webPreferences: {
            session: session.defaultSession,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        this.extensionWindows.set(win.id, { extensionId: extId, window: win });
        const windowId = win.id;
        win.on("closed", () => {
          this.extensionWindows.delete(windowId);
          this.emit("windows.onRemoved", [windowId], extId);
        });
        await win.loadURL(url);
        if (data.focused === false) win.showInactive();
        else win.show();
        this.emit("windows.onCreated", [this.windowDetails(win, caller.extension)], extId);
        return this.windowDetails(win, caller.extension);
      }
      case "windows.update": {
        const win = this.getWindow();
        if (!win || (args[0] !== -2 && args[0] !== win.id))
          throw new Error("No such browser window");
        const data = z.object({ focused: z.boolean().optional() }).strict().parse(args[1]);
        if (data.focused) win.focus();
        return this.windowDetails(win, caller.extension);
      }
      case "windows.remove": {
        const owned = this.extensionWindows.get(idSchema.parse(args[0]));
        if (!owned || owned.extensionId !== extId)
          throw new Error("Extensions can only close their own windows");
        owned.window.close();
        return;
      }
      case "webNavigation.getAllFrames":
      case "webNavigation.getFrame": {
        const data = z
          .object({ tabId: idSchema, frameId: z.number().int().optional() })
          .parse(args[0]);
        const wc = this.tab(data.tabId).contents;
        const frames = wc.mainFrame.framesInSubtree
          .filter((frame) => !frame.detached)
          .map((frame) => this.frameDetails(wc, frame));
        return name.endsWith("getFrame")
          ? (frames.find((frame) => frame.frameId === data.frameId) ?? null)
          : frames;
      }
      case "contextMenus.create": {
        const data = menuSchema.parse(args[0]);
        let menus = this.menus.get(extId);
        if (!menus) {
          menus = new Map();
          this.menus.set(extId, menus);
        }
        if (menus.has(data.id)) throw new Error("Duplicate extension menu ID");
        if (data.parentId && !menus.has(data.parentId))
          throw new Error("Unknown extension menu parent");
        menus.set(data.id, data);
        return data.id;
      }
      case "contextMenus.update": {
        const id = z.string().parse(args[0]),
          previous = this.menus.get(extId)?.get(id);
        if (!previous) throw new Error("No such extension menu");
        const updated = menuSchema.parse({ ...previous, ...object.parse(args[1]), id });
        let parentId = updated.parentId;
        const visited = new Set([id]);
        while (parentId) {
          if (visited.has(parentId)) throw new Error("Cyclic extension menu parent");
          visited.add(parentId);
          const parent = this.menus.get(extId)?.get(parentId);
          if (!parent) throw new Error("Unknown extension menu parent");
          parentId = parent.parentId;
        }
        this.menus.get(extId)?.set(id, updated);
        return;
      }
      case "contextMenus.remove":
        this.menus.get(extId)?.delete(z.string().parse(args[0]));
        return;
      case "contextMenus.removeAll":
        this.menus.delete(extId);
        return;
      case "permissions.getAll":
        return this.permissions(caller.extension);
      case "permissions.contains": {
        const data = z
          .object({
            permissions: z.array(z.string()).optional(),
            origins: z.array(z.string()).optional(),
          })
          .parse(args[0]);
        const have = this.permissions(caller.extension);
        return (
          (data.permissions ?? []).every((value) => have.permissions.includes(value)) &&
          (data.origins ?? []).every((value) => have.origins.includes(value))
        );
      }
      case "permissions.request": {
        const data = z
          .object({
            permissions: z.array(z.string()).default([]),
            origins: z.array(z.string()).default([]),
          })
          .parse(args[0]);
        const have = this.permissions(caller.extension);
        // Additional grants need a native permission implementation and review UI.
        return (
          data.permissions.every((value) => have.permissions.includes(value)) &&
          data.origins.every((value) => have.origins.includes(value))
        );
      }
      case "permissions.remove":
        return false;
      case "privacy.get":
        return { value: false, levelOfControl: "not_controllable" };
      case "privacy.set":
        throw new Error("This browser has no built-in autofill setting to change");
      case "commands.listen":
        if (z.boolean().parse(args[0])) {
          this.commandListeners.add(caller.host);
          for (const resolve of this.commandWaiters.get(caller.host) ?? []) resolve();
        } else this.commandListeners.delete(caller.host);
        return;
      case "commands.getAll":
        return this.commands()
          .filter((command) => command.extension.id === extId)
          .map(({ name, description, shortcut }) => ({ name, description, shortcut }));
      case "action.openPopup": {
        this.openAction(caller.extension);
        return;
      }
      case "notifications.getPermissionLevel":
        return Notification.isSupported() ? "granted" : "denied";
      case "notifications.getAll":
        return Object.fromEntries(
          [...this.notifications.keys()]
            .filter((key) => key.startsWith(`${extId}:`))
            .map((key) => [key.slice(extId.length + 1), true]),
        );
      case "notifications.create": {
        const id =
          typeof args[0] === "string" ? args[0] || crypto.randomUUID() : crypto.randomUUID();
        const data = z
          .object({ title: z.string(), message: z.string() })
          .parse(args[typeof args[0] === "string" ? 1 : 0]);
        if (!Notification.isSupported()) throw new Error("Desktop notifications are unavailable");
        const key = `${extId}:${id}`;
        this.notifications.get(key)?.close();
        const notification = new Notification({ title: data.title, body: data.message });
        this.notifications.set(key, notification);
        notification.on("click", () => this.emit("notifications.onClicked", [id], extId));
        notification.on("close", () => {
          if (this.notifications.get(key) !== notification) return;
          this.notifications.delete(key);
          this.emit("notifications.onClosed", [id, false], extId);
        });
        notification.show();
        return id;
      }
      case "notifications.clear": {
        const key = `${extId}:${z.string().parse(args[0])}`,
          notification = this.notifications.get(key);
        if (!notification) return false;
        this.notifications.delete(key);
        notification.close();
        this.emit("notifications.onClosed", [key.slice(extId.length + 1), false], extId);
        return true;
      }
      default:
        throw new Error(`Unsupported extension browser API: ${name}`);
    }
  }

  private commands() {
    const reserved = new Set((this.commandHost?.reserved() ?? []).map((key) => commandChord(key)));
    return session.defaultSession.extensions
      .getAllExtensions()
      .sort((a, b) => a.id.localeCompare(b.id))
      .flatMap((extension) =>
        Object.entries(
          (extension.manifest as { commands?: Record<string, ExtensionCommand> }).commands ?? {},
        ).map(([name, details]) => {
          let shortcut = suggestedShortcut(details);
          const chord = commandChord(shortcut);
          if (!chord || reserved.has(chord)) shortcut = "";
          else reserved.add(chord);
          return { extension, name, description: details.description ?? "", shortcut, chord };
        }),
      );
  }

  private waitForCommandListener(host: Host): Promise<void> {
    if (this.commandListeners.has(host)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Extension command listener unavailable"));
      }, 5_000);
      const cleanup = () => {
        clearTimeout(timer);
        const waiters = this.commandWaiters.get(host);
        waiters?.delete(ready);
        if (!waiters?.size) this.commandWaiters.delete(host);
      };
      const waiters = this.commandWaiters.get(host) ?? new Set();
      waiters.add(ready);
      this.commandWaiters.set(host, waiters);
    });
  }

  private openAction(extension: Electron.Extension) {
    const popup = (extension.manifest as { action?: { default_popup?: string } }).action
      ?.default_popup;
    if (!popup || !this.commandHost) throw new Error("Extension has no action popup");
    this.commandHost.openPopup(extension.id, popup);
  }

  /** Called only after browser shortcuts, and only for the focused browser's content/shell. */
  handleCommand(contents: WebContents, input: Electron.Input): boolean {
    if (input.type !== "keyDown" || input.isAutoRepeat) return false;
    const tab = this.activeId === undefined ? undefined : this.tabs.get(this.activeId);
    const window = tab?.window ?? this.getWindow();
    if (
      !window ||
      window.isDestroyed() ||
      !window.isFocused() ||
      (contents !== tab?.contents && contents !== window.webContents) ||
      contents.isDestroyed()
    )
      return false;
    const command = this.commands().find(
      (command) => command.shortcut && command.chord === inputChord(input),
    );
    if (!command) return false;
    if (command.name === "_execute_action") {
      try {
        this.openAction(command.extension);
      } catch {
        return false;
      }
    } else {
      if (!tab) return false;
      // Capture the selected document, never retarget a queued command after navigation/tab changes.
      const frame = tab.contents.mainFrame;
      const url = tab.contents.getURL();
      const version = this.navigationVersions.get(tab.contents);
      void (async () => {
        const worker = (command.extension.manifest as { background?: { service_worker?: string } })
          .background?.service_worker;
        if (worker) {
          const host = await session.defaultSession.serviceWorkers.startWorkerForScope(
            `chrome-extension://${command.extension.id}/`,
          );
          await this.waitForCommandListener(host);
        }
        if (
          this.activeId !== tab.contents.id ||
          tab.contents.isDestroyed() ||
          !tab.window.isFocused() ||
          this.navigationVersions.get(tab.contents) !== version ||
          tab.contents.mainFrame !== frame ||
          tab.contents.getURL() !== url ||
          !session.defaultSession.extensions.getExtension(command.extension.id)
        )
          return;
        this.emit(
          "commands.onCommand",
          [command.name, this.visibleTab(this.tabDetails(tab.contents.id), command.extension)],
          command.extension.id,
        );
      })().catch(() => {
        /* A stopped or unloaded worker cannot receive commands. */
      });
    }
    return true;
  }

  private navigationUrl(value: string, extension: Electron.Extension): string {
    const url = new URL(value, `chrome-extension://${extension.id}/`);
    if (
      ["http:", "https:", "about:"].includes(url.protocol) ||
      (url.protocol === "chrome-extension:" && url.hostname === extension.id)
    )
      return url.href;
    throw new Error("Unsupported extension navigation URL");
  }

  contextMenu(tabId: TabId): MenuItemConstructorOptions[] {
    const tab = [...this.tabs.values()].find((tab) => tab.id === tabId);
    if (!tab) return [];
    const params = this.contextParams.get(tab.contents.id);
    if (!params) return [];
    const items: MenuItemConstructorOptions[] = [];
    for (const [extId, menus] of this.menus) {
      const build = (parentId?: string): MenuItemConstructorOptions[] =>
        [...menus.values()]
          .filter(
            (item) =>
              item.parentId === parentId &&
              item.visible !== false &&
              (item.contexts ?? ["page"]).some(
                (context) =>
                  context === "all" ||
                  context === "page" ||
                  (context === "editable" && params.isEditable) ||
                  (context === "selection" && !!params.selectionText) ||
                  (context === "link" && !!params.linkURL) ||
                  context === params.mediaType,
              ),
          )
          .map((item) => ({
            label: item.title?.replace(/%s/g, params.selectionText ?? ""),
            type: item.type,
            enabled: item.enabled !== false,
            checked: item.checked,
            ...(Array.from(menus.values()).some((child) => child.parentId === item.id)
              ? { submenu: build(item.id) }
              : {}),
            click: () =>
              this.emit(
                "contextMenus.onClicked",
                [
                  {
                    menuItemId: item.id,
                    parentMenuItemId: item.parentId,
                    pageUrl: params.pageURL,
                    frameUrl: params.frameURL,
                    selectionText: params.selectionText,
                    editable: params.isEditable,
                  },
                  this.tabDetails(tab.contents.id),
                ],
                extId,
              ),
          }));
      items.push(...build());
    }
    return items;
  }
}
