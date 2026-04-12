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
  EXTENSIONS_SEARCH,
  EXTENSIONS_SEARCH_RESULTS,
  EXTENSIONS_SET_ENABLED,
  EXTENSIONS_UNINSTALL,
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

function emitChanged(events: EventBus<AllEvents>): void {
  events.emit(EXTENSIONS_CHANGED, {
    extensions: installedExtensions.map((e) => ({
      id: e.id,
      name: e.name,
      version: e.version,
      enabled: e.enabled,
    })),
  });
}

function getExtensionsDir(platform: Platform): string {
  return path.join(platform.getUserDataPath(), "extensions");
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

  // Use Node's built-in to extract zip
  // Since we can't use a zip library, write the zip to a temp file and use unzip
  const zipPath = path.join(targetDir, "__temp.zip");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(zipPath, zipData);

  try {
    // Use the system unzip command
    const { execSync } = await import("node:child_process");
    execSync(`unzip -o -q "${zipPath}" -d "${targetDir}"`, {
      timeout: 30000,
    });
  } finally {
    // Clean up temp zip
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

        // Load into session
        const loaded = await platform.loadExtension(extensionDir);

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
      // Remove from session
      platform.removeExtension(extensionId);

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
        await platform.loadExtension(extensionDir);
      } else if (!enabled && ext.enabled) {
        // Unload extension
        platform.removeExtension(extensionId);
      }

      ext.enabled = enabled;
      await dataStore
        .setSetting("extensions", installedExtensions)
        .catch(logError("extensions", "persist enabled state"));

      emitChanged(events);
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
        const loaded = await platform.loadExtension(extensionDir);
        // Update version/name from loaded extension in case it changed
        ext.name = loaded.name || ext.name;
        ext.version = loaded.version || ext.version;
      } catch (error) {
        console.error(`Failed to load extension ${ext.id}:`, error);
      }
    }

    emitChanged(events);
  },
});
