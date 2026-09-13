import { contextBridge, ipcRenderer } from "electron";

// Only extension main worlds receive this API. Web pages and their workers do not.
const extensionId = contextBridge.executeInMainWorld({
  func: () => {
    const chrome = (globalThis as unknown as { chrome?: { runtime?: { id?: string } } }).chrome;
    return chrome?.runtime?.id;
  },
});

if (typeof extensionId === "string" && /^[a-p]{32}$/.test(extensionId)) {
  contextBridge.exposeInMainWorld("__chiaroscuroExtensionBrowser", {
    invoke: (method: string, args: unknown[]) =>
      ipcRenderer.invoke("extension-browser:call", method, args),
    subscribe: (dispatch: (name: string, args: unknown[]) => void) => {
      ipcRenderer.on("extension-browser:event", (_event, name: string, args: unknown[]) =>
        dispatch(name, args),
      );
      ipcRenderer.send("extension-browser:subscribe");
    },
  });
  contextBridge.executeInMainWorld({
    func: () => {
      // Chrome's extension API definitions are owned by Chromium, outside our DOM types.
      // biome-ignore lint/suspicious/noExplicitAny: native extension global
      const root = globalThis as any;
      const chrome = root.chrome;
      const bridge = root.__chiaroscuroExtensionBrowser;
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      function dispatchEvent(name: string, args: unknown[]) {
        for (const listener of listeners.get(name) ?? []) {
          try {
            listener(...args);
          } catch (error) {
            root.reportError(error);
          }
        }
      }
      bridge.subscribe(dispatchEvent);
      function event(name: string) {
        const callbacks = new Set<(...args: unknown[]) => void>();
        listeners.set(name, callbacks);
        return {
          addListener: (callback: (...args: unknown[]) => void) => {
            callbacks.add(callback);
          },
          removeListener: (callback: (...args: unknown[]) => void) => {
            callbacks.delete(callback);
          },
          hasListener: (callback: (...args: unknown[]) => void) => callbacks.has(callback),
          hasListeners: () => callbacks.size > 0,
        };
      }
      const originalRuntime = chrome.runtime;
      const nativeGetContexts = originalRuntime.getContexts?.bind(originalRuntime);
      const getContexts = (
        filter: Record<string, unknown> = {},
        callback?: (contexts: unknown[]) => void,
      ) => {
        const promise = Promise.all([
          nativeGetContexts ? nativeGetContexts(filter) : [],
          call("runtime.getContexts")(filter),
        ]).then(([native, owned]) => {
          const contexts = owned as Record<string, unknown>[];
          return [
            ...native.filter(
              (context: Record<string, unknown>) =>
                ["BACKGROUND", "OFFSCREEN_DOCUMENT", "TAB", "POPUP", "SIDE_PANEL"].includes(
                  String(context.contextType),
                ) && !contexts.some((entry) => entry.documentUrl === context.documentUrl),
            ),
            ...contexts,
          ];
        });
        if (!callback) return promise;
        promise.then(callback, (error: Error) => {
          lastError = { message: error.message };
          try {
            callback([]);
          } finally {
            lastError = undefined;
          }
        });
        return undefined;
      };
      Object.defineProperty(chrome.runtime, "getContexts", {
        configurable: true,
        value: getContexts,
      });
      if (root.browser?.runtime)
        Object.defineProperty(root.browser.runtime, "getContexts", {
          configurable: true,
          value: getContexts,
        });
      let lastError: { message: string } | undefined;
      const nativeLastError = Object.getOwnPropertyDescriptor(originalRuntime, "lastError")?.get;
      Object.defineProperty(chrome.runtime, "lastError", {
        configurable: true,
        get: () => lastError ?? nativeLastError?.call(originalRuntime),
      });
      function call(method: string) {
        return (...args: unknown[]) => {
          const callback =
            typeof args.at(-1) === "function"
              ? (args.pop() as (value?: unknown) => void)
              : undefined;
          // Construct promises in the extension world so frameworks can track callbacks.
          const promise = new Promise((resolve, reject) => {
            bridge
              .invoke(method, args)
              .then((result: { ok: boolean; value?: unknown; error?: string }) => {
                if (!result.ok) reject(new Error(result.error));
                else resolve(result.value);
              }, reject);
          });
          if (!callback) return promise;
          promise.then(callback, (error: Error) => {
            lastError = { message: error.message };
            try {
              callback();
            } finally {
              lastError = undefined;
            }
          });
          return undefined;
        };
      }
      function api(name: string, methods: string[], events: string[]) {
        // Chromium can refresh its lazy namespace properties after startup.
        // Patch its cached API object in place so those refreshes retain our methods.
        chrome[name] ??= {};
        for (const method of methods) chrome[name][method] = call(`${name}.${method}`);
        for (const namePart of events) chrome[name][namePart] = event(`${name}.${namePart}`);
      }
      api(
        "tabs",
        ["query", "get", "getCurrent", "create", "update", "remove"],
        ["onCreated", "onUpdated", "onActivated", "onRemoved"],
      );
      api(
        "windows",
        ["get", "getCurrent", "getLastFocused", "getAll", "create", "update", "remove"],
        ["onCreated", "onRemoved", "onFocusChanged"],
      );
      Object.assign(chrome.windows, { WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2 });
      api(
        "webNavigation",
        ["getFrame", "getAllFrames"],
        [
          "onBeforeNavigate",
          "onCommitted",
          "onDOMContentLoaded",
          "onCompleted",
          "onErrorOccurred",
          "onHistoryStateUpdated",
        ],
      );
      api("contextMenus", ["update", "remove", "removeAll"], ["onClicked"]);
      chrome.contextMenus.create = (options: Record<string, unknown>, callback?: () => void) => {
        const id = options.id ?? crypto.randomUUID();
        call("contextMenus.create")({ ...options, id }, callback ?? (() => {}));
        return id;
      };
      api("permissions", ["contains", "getAll", "request", "remove"], ["onAdded", "onRemoved"]);
      api(
        "notifications",
        ["create", "clear", "getAll", "getPermissionLevel"],
        ["onClicked", "onClosed", "onButtonClicked"],
      );
      api("commands", ["getAll"], ["onCommand"]);
      // Electron does not deliver native storage change events to MV3 workers.
      // Keep Chromium's storage, including in-memory session keys, and forward
      // invalidations. Workers re-read authoritative values to deduplicate signals.
      if (chrome.storage) {
        const changed = event("storage.workerChanged");
        if (typeof root.document === "undefined") {
          const globalChanged = event("storage.onChanged");
          Object.defineProperty(chrome.storage, "onChanged", {
            configurable: true,
            writable: true,
            value: globalChanged,
          });
          const known = new Map<string, string | undefined>();
          let pending = Promise.resolve();
          const areas = new Map<
            string,
            { get: (keys: unknown) => Promise<Record<string, unknown>> }
          >();
          for (const name of ["local", "session"]) {
            const nativeArea = chrome.storage[name];
            if (!nativeArea) continue;
            // Native StorageArea.onChanged is a getter; redefine it on the original object.
            const area = nativeArea;
            chrome.storage[name] = area;
            const get = nativeArea.get.bind(nativeArea);
            areas.set(name, { get });
            Object.defineProperty(area, "onChanged", {
              configurable: true,
              writable: true,
              value: event(`storage.${name}.onChanged`),
            });
            for (const operation of ["set", "remove", "clear"]) {
              const native = area[operation].bind(area);
              area[operation] = (...args: unknown[]) => {
                const callback =
                  typeof args.at(-1) === "function" ? (args.pop() as () => void) : undefined;
                const promise = (async () => {
                  const keys =
                    operation === "set"
                      ? Object.keys(args[0] as object)
                      : operation === "remove"
                        ? args[0]
                        : null;
                  const before = await get(keys);
                  await native(...args);
                  const after = await get(keys);
                  const changes = Object.fromEntries(
                    [...new Set([...Object.keys(before), ...Object.keys(after)])]
                      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
                      .map((key) => [
                        key,
                        {
                          ...(key in before ? { oldValue: before[key] } : {}),
                          ...(key in after ? { newValue: after[key] } : {}),
                        },
                      ]),
                  );
                  if (Object.keys(changes).length)
                    await bridge.invoke("storage.changed", [changes, name]);
                })();
                if (!callback) return promise;
                promise.then(callback, (error: Error) => {
                  lastError = { message: error.message };
                  try {
                    callback();
                  } finally {
                    lastError = undefined;
                  }
                });
                return undefined;
              };
            }
          }
          changed.addListener((raw, areaName) => {
            const name = String(areaName),
              area = areas.get(name);
            if (!area) return;
            const changes = raw as Record<string, { oldValue?: unknown; newValue?: unknown }>;
            pending = pending
              .then(async () => {
                const current = await area.get(Object.keys(changes));
                const update: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
                for (const [key, change] of Object.entries(changes)) {
                  const cacheKey = `${name}:${key}`,
                    value = JSON.stringify(current[key]);
                  const previous = known.has(cacheKey)
                    ? known.get(cacheKey)
                    : JSON.stringify(change.oldValue);
                  known.set(cacheKey, value);
                  if (value === previous) continue;
                  update[key] = {
                    ...(previous !== undefined ? { oldValue: JSON.parse(previous) } : {}),
                    ...(key in current ? { newValue: current[key] } : {}),
                  };
                }
                if (!Object.keys(update).length) return;
                dispatchEvent(`storage.${name}.onChanged`, [update]);
                dispatchEvent("storage.onChanged", [update, name]);
              })
              .catch(() => {
                /* A removed extension cannot read storage. */
              });
          });
          if (root.browser?.storage) {
            root.browser.storage.onChanged = chrome.storage.onChanged;
            for (const name of ["local", "session"]) {
              root.browser.storage[name] = chrome.storage[name];
            }
          }
        } else {
          chrome.storage.onChanged.addListener((changes: unknown, area: string) => {
            if (area === "local" || area === "session") {
              dispatchEvent(`storage.${area}.onChanged`, [changes]);
              void bridge.invoke("storage.changed", [changes, area]);
            }
          });
          for (const name of ["local", "session"]) {
            const nativeArea = chrome.storage[name];
            const area = nativeArea;
            // Normalize per-area events from the native global stream in documents too.
            Object.defineProperty(area, "onChanged", {
              configurable: true,
              writable: true,
              value: event(`storage.${name}.onChanged`),
            });
            for (const operation of ["set", "remove", "clear"]) {
              const native = nativeArea[operation].bind(nativeArea);
              area[operation] = (...args: unknown[]) => {
                const callback =
                  typeof args.at(-1) === "function" ? (args.pop() as () => void) : undefined;
                const promise = (async () => {
                  await native(...args);
                  // Drain native reads queued by onChanged listeners before resolving
                  // the write, so navigation guards observe the updated state.
                  const keys =
                    operation === "set"
                      ? Object.keys(args[0] as object)
                      : operation === "remove"
                        ? args[0]
                        : null;
                  await nativeArea.get(keys);
                })();
                if (!callback) return promise;
                promise.then(callback, (error: Error) => {
                  lastError = { message: error.message };
                  try {
                    callback();
                  } finally {
                    lastError = undefined;
                  }
                });
                return undefined;
              };
            }
            chrome.storage[name] = area;
            if (root.browser?.storage) root.browser.storage[name] = area;
          }
        }
        // There is no enterprise policy provider. Managed storage is empty and read-only.
        chrome.storage.managed = {
          get: call("storage.managed.get"),
          getBytesInUse: call("storage.managed.getBytesInUse"),
          set: call("storage.managed.write"),
          remove: call("storage.managed.write"),
          clear: call("storage.managed.write"),
          onChanged: event("storage.managed.onChanged"),
        };
        if (root.browser?.storage) root.browser.storage.managed = chrome.storage.managed;
      }
      // This browser has no competing built-in password/card/address autofill.
      // Report these settings as disabled and not controllable, never pretend to change them.
      chrome.privacy ??= {};
      chrome.privacy.services = Object.fromEntries(
        ["passwordSavingEnabled", "autofillAddressEnabled", "autofillCreditCardEnabled"].map(
          (name) => [
            name,
            {
              get: call("privacy.get"),
              set: call("privacy.set"),
              clear: call("privacy.set"),
              onChange: event(`privacy.${name}.onChange`),
            },
          ],
        ),
      );
      // Chromium exposes distinct chrome.* and browser.* namespaces. Extensions
      // can use both in one page; give both the same browser-owned operations.
      if (root.browser) {
        for (const name of [
          "tabs",
          "windows",
          "webNavigation",
          "contextMenus",
          "permissions",
          "notifications",
          "commands",
          "privacy",
        ]) {
          root.browser[name] = chrome[name];
        }
      }
    },
  });
}
