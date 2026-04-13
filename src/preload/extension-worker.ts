/**
 * Session-level service worker preload for extension background workers.
 *
 * Registered via session.registerPreloadScript({ type: 'service-worker' }).
 * Runs in ALL service workers but only activates for extension workers
 * (detected by chrome.runtime.id being set by Electron).
 *
 * Bridges IPC messages from the main process into the worker's
 * chrome.runtime.onMessage / chrome.runtime.onConnect listeners.
 */
import { ipcRenderer } from "electron";

type Cb = (...args: unknown[]) => unknown;

// biome-ignore lint/suspicious/noExplicitAny: service worker global scope
const g = globalThis as any;
const chromeGlobal = g.chrome;

// Activate if chrome object exists (service worker context).
// In non-extension service workers, chrome won't exist at all.
if (chromeGlobal) {
  const chromeRuntime = chromeGlobal.runtime;

  // ── Stub missing Chrome APIs ───────────────────────────────
  // Electron doesn't implement all Chrome APIs. Extensions like Bitwarden
  // crash on startup if these are missing. Provide no-op stubs so the
  // service worker can at least initialize.

  const noopEvent = {
    addListener: () => {},
    removeListener: () => {},
    hasListener: () => false,
    hasListeners: () => false,
    addRules: () => {},
    removeRules: () => {},
    getRules: () => {},
  };

  function ensureApi(obj: Record<string, unknown>, key: string, stubs: Record<string, unknown>) {
    if (!obj[key]) obj[key] = {};
    const api = obj[key] as Record<string, unknown>;
    for (const [k, v] of Object.entries(stubs)) {
      if (api[k] === undefined) api[k] = v;
    }
  }

  const chrome = g.chrome;

  ensureApi(chrome, "webNavigation", {
    onCommitted: noopEvent,
    onCompleted: noopEvent,
    onBeforeNavigate: noopEvent,
    onDOMContentLoaded: noopEvent,
    onErrorOccurred: noopEvent,
    onReferenceFragmentUpdated: noopEvent,
    onCreatedNavigationTarget: noopEvent,
    onHistoryStateUpdated: noopEvent,
    getFrame: () => Promise.resolve(null),
    getAllFrames: () => Promise.resolve([]),
  });

  ensureApi(chrome, "contextMenus", {
    create: () => {},
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    removeAll: () => Promise.resolve(),
    onClicked: noopEvent,
    ACTION_MENU_TOP_LEVEL_LIMIT: 6,
  });

  ensureApi(chrome, "notifications", {
    create: (_id: unknown, _opts: unknown, cb?: (id: string) => void) => {
      if (cb) cb("");
      return Promise.resolve("");
    },
    clear: (_id: unknown, cb?: (cleared: boolean) => void) => {
      if (cb) cb(true);
      return Promise.resolve(true);
    },
    onClicked: noopEvent,
    onClosed: noopEvent,
    onButtonClicked: noopEvent,
  });

  ensureApi(chrome, "privacy", {
    services: {
      autofillAddressEnabled: {
        get: (cb?: (d: unknown) => void) => {
          if (cb) cb({ value: true });
          return Promise.resolve({ value: true });
        },
        set: () => Promise.resolve(),
        onChange: noopEvent,
      },
      autofillCreditCardEnabled: {
        get: (cb?: (d: unknown) => void) => {
          if (cb) cb({ value: true });
          return Promise.resolve({ value: true });
        },
        set: () => Promise.resolve(),
        onChange: noopEvent,
      },
      passwordSavingEnabled: {
        get: (cb?: (d: unknown) => void) => {
          if (cb) cb({ value: true });
          return Promise.resolve({ value: true });
        },
        set: () => Promise.resolve(),
        onChange: noopEvent,
      },
    },
  });

  ensureApi(chrome, "offscreen", {
    createDocument: () => Promise.resolve(),
    closeDocument: () => Promise.resolve(),
    hasDocument: () => Promise.resolve(false),
    Reason: { CLIPBOARD: "CLIPBOARD" },
  });

  // ── Capture onMessage/onConnect listeners ──────────────────

  // Monkey-patch addListener to capture refs so we can dispatch forwarded messages.
  function patchEvent(event: unknown): Set<Cb> {
    const listeners = new Set<Cb>();
    // biome-ignore lint/suspicious/noExplicitAny: patching Chrome event internals
    const e = event as any;
    if (!e?.addListener) return listeners;

    const origAdd = e.addListener.bind(e);
    const origRemove = e.removeListener?.bind(e);

    e.addListener = (cb: Cb) => {
      listeners.add(cb);
      origAdd(cb);
    };
    if (origRemove) {
      e.removeListener = (cb: Cb) => {
        listeners.delete(cb);
        origRemove(cb);
      };
    }
    return listeners;
  }

  const messageListeners = patchEvent(chromeRuntime.onMessage);
  const connectListeners = patchEvent(chromeRuntime.onConnect);

  // ── Runtime message forwarding ─────────────────────────────

  ipcRenderer.on(
    "crx:runtime.onMessage",
    (_event, msgId: string, message: unknown, sender: unknown) => {
      let responded = false;

      const sendResponse = (response: unknown) => {
        if (!responded) {
          responded = true;
          ipcRenderer.send("crx:runtime.sendMessageResponse", msgId, response);
        }
      };

      try {
        for (const listener of messageListeners) {
          try {
            const result = listener(message, sender, sendResponse);
            if (result === true) {
              // Listener will call sendResponse asynchronously.
            } else if (result && typeof (result as Promise<unknown>).then === "function") {
              (result as Promise<unknown>).then(
                (val) => sendResponse(val),
                () => sendResponse(undefined),
              );
            }
          } catch {
            // Individual listener error — continue.
          }
        }

        // If nobody responded synchronously, send undefined after a tick.
        setTimeout(() => sendResponse(undefined), 50);
      } catch {
        sendResponse(undefined);
      }
    },
  );

  // ── Port / connect forwarding ──────────────────────────────

  function createWorkerEvent() {
    const listeners = new Set<Cb>();
    return {
      addListener(cb: Cb) {
        listeners.add(cb);
      },
      removeListener(cb: Cb) {
        listeners.delete(cb);
      },
      hasListener(cb: Cb) {
        return listeners.has(cb);
      },
      _listeners: listeners,
    };
  }

  ipcRenderer.on("crx:port.onConnect", (_event, portId: string, name: string, sender: unknown) => {
    const onMsg = createWorkerEvent();
    const onDisc = createWorkerEvent();
    let disconnected = false;

    const port = {
      name,
      sender,
      onMessage: onMsg,
      onDisconnect: onDisc,
      postMessage(message: unknown) {
        if (!disconnected) {
          ipcRenderer.send("crx:port.postMessage.fromWorker", portId, message);
        }
      },
      disconnect() {
        if (!disconnected) {
          disconnected = true;
          ipcRenderer.send("crx:port.disconnect", portId);
          for (const cb of onDisc._listeners) {
            try {
              cb();
            } catch {
              /* ignore */
            }
          }
        }
      },
    };

    ipcRenderer.on(`crx:port.onMessage:${portId}`, (_ev, message: unknown) => {
      if (!disconnected) {
        for (const cb of onMsg._listeners) {
          try {
            cb(message);
          } catch {
            /* ignore */
          }
        }
      }
    });

    ipcRenderer.on(`crx:port.onDisconnect:${portId}`, () => {
      disconnected = true;
      for (const cb of onDisc._listeners) {
        try {
          cb();
        } catch {
          /* ignore */
        }
      }
    });

    // Dispatch to captured chrome.runtime.onConnect listeners.
    for (const cb of connectListeners) {
      try {
        cb(port);
      } catch {
        /* ignore */
      }
    }
  });
}
