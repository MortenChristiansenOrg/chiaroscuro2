import fs from "node:fs";
import path from "node:path";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { logError } from "../../shared/log";
import { SingletonTab } from "../../shared/singleton-tab";
import type { TabId } from "../../shared/types";
import { TABS_CLOSED, type TabsCommands, type TabsEvents } from "../tabs/tabs.shared";
import {
  type CWSSearchResult,
  EXTENSIONS_CHANGED,
  EXTENSIONS_INSTALL,
  EXTENSIONS_INSTALL_COMPLETED,
  EXTENSIONS_INSTALL_FAILED,
  EXTENSIONS_INSTALL_STARTED,
  EXTENSIONS_OPEN,
  EXTENSIONS_OPEN_POPUP,
  EXTENSIONS_SEARCH,
  EXTENSIONS_SEARCH_RESULTS,
  EXTENSIONS_SET_ENABLED,
  EXTENSIONS_UNINSTALL,
  type ExtensionAction,
  type ExtensionsCommands,
  type ExtensionsEvents,
  type InstalledExtension,
} from "./extensions.shared";

type AllCommands = ExtensionsCommands & Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type AllEvents = ExtensionsEvents & Pick<TabsEvents, typeof TABS_CLOSED>;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
}

/** Persisted extension metadata. */
interface PersistedExtension {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

let installedExtensions: PersistedExtension[] = [];

/** Runtime-only map of extension ID → action metadata (not persisted). */
const extensionActions = new Map<string, ExtensionAction>();

/**
 * Maps persisted CWS extension ID → Electron's runtime extension ID.
 * Electron assigns its own ID when loading unpacked extensions, which may
 * differ from the CWS ID used to store the extension on disk.
 */
const runtimeIdMap = new Map<string, string>();

/** Get the Electron runtime ID for a persisted extension, falling back to the persisted ID. */
function getRuntimeId(persistedId: string): string {
  return runtimeIdMap.get(persistedId) ?? persistedId;
}

/** Extract browser action info from a Chrome extension manifest. */
function extractAction(
  extensionId: string,
  manifest: Record<string, unknown>,
): ExtensionAction | undefined {
  // Manifest V3 uses "action", V2 uses "browser_action"
  const raw = (manifest.action ?? manifest.browser_action) as Record<string, unknown> | undefined;
  if (!raw) return undefined;

  const popup = typeof raw.default_popup === "string" ? raw.default_popup : "";
  const title = typeof raw.default_title === "string" ? raw.default_title : "";

  // Resolve the best icon: prefer 16px, then 19, 32, 48, 128, or default_icon string
  let iconPath = "";
  const icons = raw.default_icon;
  if (typeof icons === "string") {
    iconPath = icons;
  } else if (icons && typeof icons === "object") {
    const sizes = Object.keys(icons as Record<string, string>);
    // Pick the smallest icon >= 16px for toolbar display
    const preferred = sizes
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    const best = preferred.find((s) => s >= 16) ?? preferred[0];
    if (best !== undefined) {
      iconPath = (icons as Record<string, string>)[String(best)] ?? "";
    }
  }

  const iconUrl = iconPath
    ? `chrome-extension://${extensionId}/${iconPath.replace(/^\//, "")}`
    : "";

  return { popup, title, iconUrl };
}

function emitChanged(events: EventBus<AllEvents>): void {
  events.emit(EXTENSIONS_CHANGED, {
    extensions: installedExtensions.map((e) => ({
      id: e.id,
      name: e.name,
      version: e.version,
      enabled: e.enabled,
      action: extensionActions.get(e.id),
    })),
  });
}

function getExtensionsDir(platform: Platform): string {
  return path.join(platform.getUserDataPath(), "extensions");
}

/**
 * Ensure the extension's service worker can start by patching the
 * background script to stub unsupported Chrome APIs.
 * Electron doesn't support all Chrome APIs (e.g. webNavigation, contextMenus,
 * notifications, privacy, offscreen). Without stubs the SW crashes on startup.
 */
function patchExtensionForElectron(extensionDir: string): void {
  const manifestPath = path.join(extensionDir, "manifest.json");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return;
  }

  // Find the service worker / background script
  const bg = manifest.background as Record<string, string> | undefined;
  const swFile = bg?.service_worker;
  if (!swFile) return;

  const swPath = path.join(extensionDir, swFile);
  if (!fs.existsSync(swPath)) return;

  const marker = "/* chiaroscuro-api-stubs */";
  const content = fs.readFileSync(swPath, "utf-8");
  if (content.startsWith(marker)) return; // Already patched

  const stubs = `${marker}
(function(){
var e={addListener:function(){},removeListener:function(){},hasListener:function(){return false},hasListeners:function(){return false},addRules:function(){},removeRules:function(){},getRules:function(){}};
function s(o,k,v){if(!o[k])o[k]={};var a=o[k];for(var p in v)if(a[p]===undefined)a[p]=v[p]}
var c=chrome||self.chrome;if(!c)return;
s(c,"webNavigation",{onCommitted:e,onCompleted:e,onBeforeNavigate:e,onDOMContentLoaded:e,onErrorOccurred:e,onReferenceFragmentUpdated:e,onCreatedNavigationTarget:e,onHistoryStateUpdated:e,getFrame:function(){return Promise.resolve(null)},getAllFrames:function(){return Promise.resolve([])}});
s(c,"contextMenus",{create:function(){},update:function(){return Promise.resolve()},remove:function(){return Promise.resolve()},removeAll:function(){return Promise.resolve()},onClicked:e,ACTION_MENU_TOP_LEVEL_LIMIT:6});
s(c,"notifications",{create:function(_,__,cb){if(cb)cb("");return Promise.resolve("")},clear:function(_,cb){if(cb)cb(true);return Promise.resolve(true)},onClicked:e,onClosed:e,onButtonClicked:e});
s(c,"offscreen",{createDocument:function(){return Promise.resolve()},closeDocument:function(){return Promise.resolve()},hasDocument:function(){return Promise.resolve(false)},Reason:{CLIPBOARD:"CLIPBOARD"}});
s(c,"privacy",{services:{autofillAddressEnabled:{get:function(cb){var v={value:true};if(cb)cb(v);return Promise.resolve(v)},set:function(){return Promise.resolve()},onChange:e},autofillCreditCardEnabled:{get:function(cb){var v={value:true};if(cb)cb(v);return Promise.resolve(v)},set:function(){return Promise.resolve()},onChange:e},passwordSavingEnabled:{get:function(cb){var v={value:true};if(cb)cb(v);return Promise.resolve(v)},set:function(){return Promise.resolve()},onChange:e}}});
/* IPC bridge for popup<->service worker messaging */
try{
var ipc=require("electron").ipcRenderer;
ipc.send("crx:worker-preload-debug","SW bridge loaded");
var onConnectListeners=[];
var origAddConnect=c.runtime.onConnect.addListener.bind(c.runtime.onConnect);
c.runtime.onConnect.addListener=function(cb){onConnectListeners.push(cb);origAddConnect(cb)};
var onMsgListeners=[];
var origAddMsg=c.runtime.onMessage.addListener.bind(c.runtime.onMessage);
c.runtime.onMessage.addListener=function(cb){onMsgListeners.push(cb);origAddMsg(cb)};
ipc.on("crx:runtime.onMessage",function(_ev,msgId,message,sender){
var responded=false;
var sendResponse=function(r){if(!responded){responded=true;ipc.send("crx:runtime.sendMessageResponse",msgId,r)}};
for(var i=0;i<onMsgListeners.length;i++){try{var r=onMsgListeners[i](message,sender,sendResponse);if(r===true)continue;if(r&&typeof r.then==="function")r.then(function(v){sendResponse(v)},function(){sendResponse(void 0)})}catch(e){}}
setTimeout(function(){sendResponse(void 0)},50);
});
ipc.on("crx:port.onConnect",function(_ev,portId,name,sender){
var portOnMsg={_l:[],addListener:function(cb){this._l.push(cb)},removeListener:function(){},hasListener:function(){return false}};
var portOnDisc={_l:[],addListener:function(cb){this._l.push(cb)},removeListener:function(){},hasListener:function(){return false}};
var disc=false;
var port={name:name,sender:sender,onMessage:portOnMsg,onDisconnect:portOnDisc,
postMessage:function(m){if(!disc)ipc.send("crx:port.postMessage.fromWorker",portId,m)},
disconnect:function(){if(!disc){disc=true;ipc.send("crx:port.disconnect",portId)}}};
ipc.on("crx:port.onMessage:"+portId,function(_,m){if(!disc)for(var i=0;i<portOnMsg._l.length;i++)try{portOnMsg._l[i](m)}catch(e){}});
ipc.on("crx:port.onDisconnect:"+portId,function(){disc=true;for(var i=0;i<portOnDisc._l.length;i++)try{portOnDisc._l[i]()}catch(e){}});
for(var i=0;i<onConnectListeners.length;i++)try{onConnectListeners[i](port)}catch(e){}
});
}catch(ex){/* ipc not available */}
})();
`;
  fs.writeFileSync(swPath, stubs + content);
}

// ── CWS Search ─────────────────────────────────────────────────

/**
 * Search the Chrome Web Store using the unofficial detail-page scraping approach.
 * Fetches the CWS search page and extracts extension metadata from the HTML.
 */
async function searchCWS(query: string): Promise<CWSSearchResult[]> {
  const url = `https://chromewebstore.google.com/search/${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) return [];

  const html = await response.text();
  return parseCWSSearchResults(html);
}

/**
 * Parse extension data from CWS search page HTML.
 * CWS embeds structured data in AF_initDataCallback calls within script tags.
 * Each extension entry lives at data[0][0][0][5][0][0][N][0][0] with fields:
 *   [0] = extension ID, [1] = icon URL, [2] = name, [6] = description
 */
function parseCWSSearchResults(html: string): CWSSearchResult[] {
  // Try structured data first (AF_initDataCallback)
  const structured = parseStructuredData(html);
  if (structured.length > 0) return structured;

  // Fallback: scrape detail links from HTML
  return parseFallback(html);
}

/** Extract extension data from the AF_initDataCallback JSON embedded in the page. */
function parseStructuredData(html: string): CWSSearchResult[] {
  const marker = "AF_initDataCallback({key: 'ds:1'";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return [];

  const dataStart = html.indexOf("data:", startIdx);
  if (dataStart === -1) return [];

  // Find the data array by bracket-matching from "data:" to the closing bracket
  const arrayStart = dataStart + 5; // skip "data:"
  let depth = 0;
  let i = arrayStart;
  let inString = false;
  let escaped = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "[") depth++;
    if (ch === "]") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  let data: unknown;
  try {
    data = JSON.parse(html.substring(arrayStart, i));
  } catch {
    return [];
  }

  // Navigate to the extension list: data[0][0][0][5][0][0]
  const extList = at(at(at(at(at(at(data, 0), 0), 0), 5), 0), 0);
  if (!Array.isArray(extList)) return [];

  const results: CWSSearchResult[] = [];
  for (const wrapper of extList) {
    // Each entry is at wrapper[0][0]
    const entry = at(at(wrapper, 0), 0);
    if (!Array.isArray(entry)) continue;

    const id = entry[0];
    const iconUrl = entry[1];
    const name = entry[2];
    const rating = entry[3];
    const ratingCount = entry[4];
    const description = entry[6];
    const featured = entry[8];
    const userCount = entry[14];

    if (typeof id !== "string" || !/^[a-z]{32}$/.test(id)) continue;

    results.push({
      id,
      name: typeof name === "string" ? name : id,
      description: typeof description === "string" ? description : "",
      iconUrl: typeof iconUrl === "string" ? iconUrl : "",
      featured: featured === 1,
      rating: typeof rating === "number" ? rating : null,
      ratingCount: typeof ratingCount === "number" ? ratingCount : null,
      userCount: typeof userCount === "number" ? userCount : null,
    });
  }

  return results;
}

/** Safe nested array access. */
function at(arr: unknown, index: number): unknown {
  return Array.isArray(arr) ? arr[index] : undefined;
}

/** Fallback parser: extract extension IDs from detail links in the HTML. */
function parseFallback(html: string): CWSSearchResult[] {
  const results: CWSSearchResult[] = [];
  const detailPattern = /\/detail\/([^/]+)\/([a-z]{32})/g;
  const seenIds = new Set<string>();

  for (const match of html.matchAll(detailPattern)) {
    const id = match[2] ?? "";
    const slug = match[1] ?? "";
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const name = decodeURIComponent(slug)
      .replace(/-/g, " ")
      .split(" ")
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");

    results.push({
      id,
      name,
      description: "",
      iconUrl: "",
      featured: false,
      rating: null,
      ratingCount: null,
      userCount: null,
    });
  }

  return results;
}

// ── CRX Download & Extract ──────────────────────────────────────

/**
 * Download a CRX file from Google's CRX update endpoint.
 * Returns the raw CRX buffer.
 */
async function downloadCRX(extensionId: string): Promise<Buffer> {
  const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;

  const response = await fetch(crxUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to download CRX: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Extract a CRX file to a directory.
 * CRX format: magic number (4 bytes) + version (4 bytes) + header length (4 bytes) + header + zip data.
 * CRX3: magic (4) + version (4) + header_size (4) + header (header_size) + zip
 */
async function extractCRX(crxBuffer: Buffer, targetDir: string): Promise<void> {
  // CRX magic number: Cr24
  const magic = crxBuffer.toString("ascii", 0, 4);
  if (magic !== "Cr24") {
    throw new Error(`Invalid CRX file: bad magic number "${magic}"`);
  }

  const version = crxBuffer.readUInt32LE(4);
  let zipStart: number;

  if (version === 3) {
    // CRX3 format
    const headerSize = crxBuffer.readUInt32LE(8);
    zipStart = 12 + headerSize;
  } else if (version === 2) {
    // CRX2 format: magic(4) + version(4) + pubkey_len(4) + sig_len(4) + pubkey + sig + zip
    const pubKeyLen = crxBuffer.readUInt32LE(8);
    const sigLen = crxBuffer.readUInt32LE(12);
    zipStart = 16 + pubKeyLen + sigLen;
  } else {
    throw new Error(`Unsupported CRX version: ${version}`);
  }

  const zipData = crxBuffer.subarray(zipStart);

  const zipPath = path.join(targetDir, "__temp.zip");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(zipPath, zipData);

  try {
    const { execSync } = await import("node:child_process");
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${targetDir}'"`,
        { timeout: 30000 },
      );
    } else {
      execSync(`unzip -o -q "${zipPath}" -d "${targetDir}"`, {
        timeout: 30000,
      });
    }
  } finally {
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── Feature ─────────────────────────────────────────────────────

export default defineFeature<Deps>({
  register({ commands, events, platform, dataStore }) {
    installedExtensions = [];

    const extensionsTab = new SingletonTab({
      activate: (tabId) => commands.send("tabs:activate", { tabId }),
      create: (url) => commands.send("tabs:create", { url }),
    });

    events.on(TABS_CLOSED, (payload) => {
      extensionsTab.onClose(payload.tabId);
    });

    commands.handle(EXTENSIONS_OPEN, async () => {
      await extensionsTab.openOrActivate("/extensions");
    });

    commands.handle(EXTENSIONS_SEARCH, async ({ query }) => {
      const results = await searchCWS(query);
      events.emit(EXTENSIONS_SEARCH_RESULTS, { query, results });
      return results;
    });

    commands.handle(EXTENSIONS_INSTALL, async ({ extensionId, name }) => {
      events.emit(EXTENSIONS_INSTALL_STARTED, { extensionId });

      try {
        const extensionsDir = getExtensionsDir(platform);
        const extensionDir = path.join(extensionsDir, extensionId);

        // Download and extract
        const crxBuffer = await downloadCRX(extensionId);
        await extractCRX(crxBuffer, extensionDir);

        // Patch and load into session
        patchExtensionForElectron(extensionDir);
        const loaded = await platform.loadExtension(extensionDir);

        // Track ID mapping and cache action metadata
        if (loaded.id !== extensionId) runtimeIdMap.set(extensionId, loaded.id);
        const action = extractAction(loaded.id, loaded.manifest);
        if (action) extensionActions.set(extensionId, action);

        // Update persisted state
        const existing = installedExtensions.find((e) => e.id === extensionId);
        if (existing) {
          existing.name = loaded.name || name;
          existing.version = loaded.version;
          existing.enabled = true;
        } else {
          installedExtensions.push({
            id: extensionId,
            name: loaded.name || name,
            version: loaded.version,
            enabled: true,
          });
        }

        await dataStore
          .setSetting("extensions", installedExtensions)
          .catch(logError("extensions", "persist installed extensions"));

        events.emit(EXTENSIONS_INSTALL_COMPLETED, { extensionId });
        emitChanged(events);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        events.emit(EXTENSIONS_INSTALL_FAILED, { extensionId, error: message });
        throw error;
      }
    });

    commands.handle(EXTENSIONS_UNINSTALL, async ({ extensionId }) => {
      // Remove from session and action cache — use runtime ID
      platform.removeExtension(getRuntimeId(extensionId));
      extensionActions.delete(extensionId);
      runtimeIdMap.delete(extensionId);

      // Remove from disk
      const extensionsDir = getExtensionsDir(platform);
      const extensionDir = path.join(extensionsDir, extensionId);
      try {
        fs.rmSync(extensionDir, { recursive: true, force: true });
      } catch {
        // Ignore if directory doesn't exist
      }

      // Update persisted state
      installedExtensions = installedExtensions.filter((e) => e.id !== extensionId);
      await dataStore
        .setSetting("extensions", installedExtensions)
        .catch(logError("extensions", "persist after uninstall"));

      emitChanged(events);
    });

    commands.handle(EXTENSIONS_SET_ENABLED, async ({ extensionId, enabled }) => {
      const ext = installedExtensions.find((e) => e.id === extensionId);
      if (!ext) return;

      if (enabled && !ext.enabled) {
        // Load extension
        const extensionsDir = getExtensionsDir(platform);
        const extensionDir = path.join(extensionsDir, extensionId);
        patchExtensionForElectron(extensionDir);
        const loaded = await platform.loadExtension(extensionDir);
        if (loaded.id !== extensionId) runtimeIdMap.set(extensionId, loaded.id);
        const action = extractAction(loaded.id, loaded.manifest);
        if (action) extensionActions.set(extensionId, action);
      } else if (!enabled && ext.enabled) {
        // Unload extension — use runtime ID
        platform.removeExtension(getRuntimeId(extensionId));
        extensionActions.delete(extensionId);
        runtimeIdMap.delete(extensionId);
      }

      ext.enabled = enabled;
      await dataStore
        .setSetting("extensions", installedExtensions)
        .catch(logError("extensions", "persist enabled state"));

      emitChanged(events);
    });

    commands.handle(EXTENSIONS_OPEN_POPUP, async ({ extensionId }) => {
      const action = extensionActions.get(extensionId);
      if (!action?.popup) return;
      // Use the Electron runtime ID, which may differ from the persisted CWS ID
      platform.openExtensionPopup(getRuntimeId(extensionId), action.popup);
    });
  },

  async start({ events, platform, dataStore }) {
    // Load persisted extension list
    const persisted = await dataStore.getSetting<PersistedExtension[]>("extensions");
    if (persisted) {
      installedExtensions = persisted;
    }

    // Load enabled extensions into session
    const extensionsDir = getExtensionsDir(platform);
    for (const ext of installedExtensions) {
      if (!ext.enabled) continue;
      const extensionDir = path.join(extensionsDir, ext.id);
      if (!fs.existsSync(extensionDir)) continue;
      try {
        patchExtensionForElectron(extensionDir);
        const loaded = await platform.loadExtension(extensionDir);
        ext.name = loaded.name || ext.name;
        ext.version = loaded.version || ext.version;
        // Track ID mapping (CWS ID → Electron runtime ID)
        if (loaded.id !== ext.id) runtimeIdMap.set(ext.id, loaded.id);
        // Cache action metadata using the runtime ID
        const action = extractAction(loaded.id, loaded.manifest);
        if (action) extensionActions.set(ext.id, action);
      } catch (error) {
        console.error(`Failed to load extension ${ext.id}:`, error);
      }
    }

    emitChanged(events);
  },
});
