/**
 * Session-level frame preload for extension popup pages.
 *
 * Registered via session.registerPreloadScript({ type: 'frame' }).
 * Runs in ALL renderer frames but only activates for extension popup pages
 * (detected by file:// URL pointing to an extensions directory).
 *
 * Exposes a chrome.* API polyfill that bridges to the main process via IPC.
 */
import { ipcRenderer } from "electron";

// ── URL detection ──────────────────────────────────────────────

// Match file:// URLs inside an extensions dir with a 32-char lowercase hex ID.
// e.g. file:///C:/Users/.../extensions/nngceckbapebfimnlniiiahkandclblb/popup/index.html
const EXT_ID_RE = /[/\\]extensions[/\\]([a-z]{32})[/\\]/;

const href = typeof location !== "undefined" ? location.href : "";
const match = href.startsWith("file:") ? EXT_ID_RE.exec(href) : null;

if (match) {
  const extensionId = match[1] ?? "";

  // Derive the extension's root directory from the URL path.
  const pathPart = decodeURIComponent(new URL(href).pathname);
  const idIdx = pathPart.indexOf(extensionId);
  const extensionRoot = pathPart.substring(0, idIdx + extensionId.length);
  // On Windows file:// URLs start with /C:/ — keep that for getURL consistency.

  // Fetch manifest synchronously so we can expose chrome.* before page scripts run.
  const manifest: Record<string, unknown> = ipcRenderer.sendSync("crx:getManifest", extensionId);

  // ── Event helper ───────────────────────────────────────────────

  type Listener = (...args: unknown[]) => unknown;

  function createEvent() {
    const listeners = new Set<Listener>();
    return {
      addListener(cb: Listener) {
        listeners.add(cb);
      },
      removeListener(cb: Listener) {
        listeners.delete(cb);
      },
      hasListener(cb: Listener) {
        return listeners.has(cb);
      },
      /** Dispatch to all listeners, return first truthy result. */
      _dispatch(...args: unknown[]): unknown {
        let result: unknown;
        for (const cb of listeners) {
          const r = cb(...args);
          if (r !== undefined && result === undefined) result = r;
        }
        return result;
      },
      _listeners: listeners,
    };
  }

  // ── chrome.runtime ─────────────────────────────────────────────

  const onMessage = createEvent();

  // Listen for messages forwarded from the service worker via main process.
  ipcRenderer.on("crx:runtime.onMessage.toPopup", (_event, message, sender) => {
    onMessage._dispatch(message, sender);
  });

  // ── chrome.runtime.connect / Port ──────────────────────────────

  function createPort(portId: string, name: string): Record<string, unknown> {
    const portOnMessage = createEvent();
    const portOnDisconnect = createEvent();
    let disconnected = false;

    ipcRenderer.on(`crx:port.onMessage:${portId}`, (_event, message) => {
      if (!disconnected) portOnMessage._dispatch(message);
    });

    ipcRenderer.on(`crx:port.onDisconnect:${portId}`, () => {
      disconnected = true;
      portOnDisconnect._dispatch();
    });

    return {
      name,
      sender: { id: extensionId },
      postMessage(message: unknown) {
        if (!disconnected) {
          ipcRenderer.send("crx:port.postMessage", portId, message);
        }
      },
      disconnect() {
        if (!disconnected) {
          disconnected = true;
          ipcRenderer.send("crx:port.disconnect", portId);
          portOnDisconnect._dispatch();
        }
      },
      onMessage: portOnMessage,
      onDisconnect: portOnDisconnect,
    };
  }

  // ── chrome.storage ─────────────────────────────────────────────

  function createStorageArea(area: string) {
    return {
      get(keys: unknown, callback?: (items: Record<string, unknown>) => void) {
        const p = ipcRenderer.invoke("crx:storage.get", extensionId, area, keys);
        if (callback) p.then(callback);
        return p;
      },
      set(items: unknown, callback?: () => void) {
        const p = ipcRenderer.invoke("crx:storage.set", extensionId, area, items);
        if (callback) p.then(callback);
        return p;
      },
      remove(keys: unknown, callback?: () => void) {
        const p = ipcRenderer.invoke("crx:storage.remove", extensionId, area, keys);
        if (callback) p.then(callback);
        return p;
      },
      clear(callback?: () => void) {
        const p = ipcRenderer.invoke("crx:storage.remove", extensionId, area, null);
        if (callback) p.then(callback);
        return p;
      },
      getBytesInUse(_keys: unknown, callback?: (bytes: number) => void) {
        if (callback) callback(0);
        return Promise.resolve(0);
      },
      onChanged: createEvent(),
    };
  }

  const storageOnChanged = createEvent();
  ipcRenderer.on("crx:storage.onChanged", (_event, changes, areaName) => {
    storageOnChanged._dispatch(changes, areaName);
  });

  // ── chrome.i18n ────────────────────────────────────────────────

  const i18n = {
    getMessage(messageName: string, substitutions?: string | string[]) {
      return ipcRenderer.sendSync(
        "crx:i18n.getMessage",
        extensionId,
        messageName,
        substitutions,
      ) as string;
    },
    getUILanguage() {
      return navigator.language;
    },
  };

  // ── Assemble and expose ────────────────────────────────────────

  const storageLocal = createStorageArea("local");
  const storageSync = createStorageArea("sync");
  const storageSession = createStorageArea("session");

  const chromeApi = {
    runtime: {
      id: extensionId,
      getManifest: () => structuredClone(manifest),
      getURL: (path: string) => `file://${extensionRoot}/${path.replace(/^\//, "")}`,
      sendMessage(
        messageOrExtId: unknown,
        messageOrOptions?: unknown,
        optionsOrCallback?: unknown,
        callback?: (response: unknown) => void,
      ) {
        // Handle the multiple overloads of chrome.runtime.sendMessage:
        // sendMessage(message, callback?)
        // sendMessage(extensionId, message, options?, callback?)
        let message: unknown;
        let cb: ((response: unknown) => void) | undefined;

        if (typeof messageOrExtId === "string" && typeof messageOrOptions !== "function") {
          // sendMessage(extensionId, message, options?, callback?)
          message = messageOrOptions;
          cb =
            typeof optionsOrCallback === "function"
              ? (optionsOrCallback as (r: unknown) => void)
              : callback;
        } else {
          // sendMessage(message, callback?)
          message = messageOrExtId;
          cb =
            typeof messageOrOptions === "function"
              ? (messageOrOptions as (r: unknown) => void)
              : undefined;
        }

        const p = ipcRenderer.invoke("crx:runtime.sendMessage", extensionId, message);
        if (cb) p.then(cb);
        return p;
      },
      connect(connectInfo?: { name?: string }) {
        const name = connectInfo?.name ?? "";
        const portId: string = ipcRenderer.sendSync("crx:runtime.connect", extensionId, name);
        return createPort(portId, name);
      },
      onMessage,
      onConnect: createEvent(),
      onInstalled: createEvent(),
      getBackgroundPage: () => null,
      lastError: null,
    },
    storage: {
      local: storageLocal,
      sync: storageSync,
      session: storageSession,
      managed: createStorageArea("managed"),
      onChanged: storageOnChanged,
    },
    i18n,
    // Minimal stubs for APIs that extensions may probe for existence
    action: {
      onClicked: createEvent(),
      setIcon: () => Promise.resolve(),
      setBadgeText: () => Promise.resolve(),
      setBadgeBackgroundColor: () => Promise.resolve(),
      setTitle: () => Promise.resolve(),
      setPopup: () => Promise.resolve(),
    },
    tabs: {
      query: (_q: unknown, cb?: (tabs: unknown[]) => void) => {
        if (cb) cb([]);
        return Promise.resolve([]);
      },
      getCurrent: (cb?: (tab: unknown) => void) => {
        const tab = { id: 0, active: true, windowId: 1 };
        if (cb) cb(tab);
        return Promise.resolve(tab);
      },
      get: (_id: unknown, cb?: (tab: unknown) => void) => {
        const tab = { id: 0, active: true, windowId: 1 };
        if (cb) cb(tab);
        return Promise.resolve(tab);
      },
      sendMessage: () => Promise.resolve(undefined),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({}),
      onUpdated: createEvent(),
      onActivated: createEvent(),
      onRemoved: createEvent(),
      onReplaced: createEvent(),
    },
    windows: {
      getCurrent: (callback?: (w: unknown) => void) => {
        const w = { id: 1, focused: true, type: "normal" };
        if (callback) callback(w);
        return Promise.resolve(w);
      },
      getAll: (callback?: (ws: unknown[]) => void) => {
        const ws = [{ id: 1, focused: true, type: "normal" }];
        if (callback) callback(ws);
        return Promise.resolve(ws);
      },
      onFocusChanged: createEvent(),
      WINDOW_ID_NONE: -1,
      WINDOW_ID_CURRENT: -2,
    },
    permissions: {
      contains: (_perms: unknown, callback?: (result: boolean) => void) => {
        if (callback) callback(true);
        return Promise.resolve(true);
      },
      getAll: (callback?: (perms: unknown) => void) => {
        const perms = { permissions: manifest.permissions ?? [], origins: [] };
        if (callback) callback(perms);
        return Promise.resolve(perms);
      },
      onAdded: createEvent(),
      onRemoved: createEvent(),
    },
    extension: {
      getBackgroundPage: () => null,
      isAllowedIncognitoAccess: (callback?: (allowed: boolean) => void) => {
        if (callback) callback(false);
        return Promise.resolve(false);
      },
    },
  };

  // Assign directly to window.chrome. We can't use contextBridge because
  // Electron already creates a window.chrome object and contextBridge
  // throws "Cannot bind an API on top of an existing property".
  // The popup BrowserWindow uses contextIsolation: false to allow this.
  // biome-ignore lint/suspicious/noExplicitAny: assigning to global chrome object
  (globalThis as any).chrome = chromeApi;
}
