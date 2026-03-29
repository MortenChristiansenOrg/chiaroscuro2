import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandBus } from "../../bus/command-bus";
import type { EventBus } from "../../bus/event-bus";
import type { Collection, DataStore } from "../../data/types";
import type { Platform } from "../../platform/types";
import { defineFeature } from "../../shared/define-feature";
import { featureState } from "../../shared/feature-state";
import { logError } from "../../shared/log";
import type { TabId, WorkspaceId } from "../../shared/types";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import {
  type IndexEntry,
  PDF_READER_FETCH,
  PDF_READER_GET_INDEX,
  PDF_READER_INDEX_ADD,
  PDF_READER_INDEX_CHANGED,
  PDF_READER_INDEX_DELETE,
  PDF_READER_INDEX_REORDER,
  PDF_READER_INDEX_UPDATE,
  type PdfReaderCommands,
  type PdfReaderEvents,
  type PersistedPdfIndex,
} from "./pdf-reader.shared";

type AllCommands = PdfReaderCommands & Pick<TabsCommands, "tabs:create" | "tabs:close">;
type AllEvents = PdfReaderEvents &
  Pick<TabsEvents, "tabs:created" | "tabs:updated" | "tabs:closed">;

interface Deps {
  commands: CommandBus<AllCommands>;
  events: EventBus<AllEvents>;
  platform: Platform;
  dataStore: DataStore;
  getActiveTabId: () => TabId | undefined;
  getActiveWorkspaceId: () => WorkspaceId | undefined;
}

const _state = featureState<{
  sourceUrlMap: Map<TabId, string>;
}>("pdf-reader");

function isPdfUrl(url: string): boolean {
  if (url.startsWith("app:")) return false;
  try {
    const pathname = new URL(url).pathname;
    return pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().endsWith(".pdf");
  }
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(basename(pathname)) || "document.pdf";
  } catch {
    return "document.pdf";
  }
}

function computeHash(data: Buffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const chunk = bytes.slice(0, 65536); // First 64KB
  const hash = createHash("sha256");
  hash.update(chunk);
  hash.update(String(bytes.byteLength));
  return hash.digest("hex").slice(0, 16);
}

async function fetchPdfData(url: string): Promise<Buffer> {
  if (url.startsWith("file://") || url.startsWith("file:\\")) {
    const filePath = fileURLToPath(url);
    return readFile(filePath);
  }
  // HTTP(S) fetch
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export default defineFeature<Deps>({
  register({ commands, events, platform, dataStore, getActiveWorkspaceId }) {
    const indexCollection: Collection<PersistedPdfIndex> = dataStore.collection("pdf-indexes");
    const sourceUrlMap = new Map<TabId, string>();
    _state.init({ sourceUrlMap });

    // Tabs being processed for PDF conversion (prevents duplicate processing)
    const processing = new Set<TabId>();

    // ── PDF URL interception ──────────────────────────────────────

    function interceptPdfTab(tab: {
      id: TabId;
      url: string;
      workspaceId: WorkspaceId;
      builtIn?: boolean;
    }) {
      if (tab.builtIn || !isPdfUrl(tab.url) || processing.has(tab.id)) return;
      processing.add(tab.id);
      const pdfUrl = `app:pdf-reader?url=${encodeURIComponent(tab.url)}`;
      const workspaceId = tab.workspaceId;

      // Capture previous URL before closing (for back navigation)
      const prevEntry = platform.getNavigationEntry(tab.id, -1);
      const previousUrl = prevEntry?.url;

      commands
        .send("tabs:close", { tabId: tab.id })
        .then(() => commands.send("tabs:create", { url: pdfUrl, workspaceId }))
        .then((pdfTabId) => {
          if (previousUrl) sourceUrlMap.set(pdfTabId, previousUrl);
        })
        .catch(logError("pdf-reader", "intercept pdf tab"))
        .finally(() => processing.delete(tab.id));
    }

    events.on("tabs:created", ({ tab }) => interceptPdfTab(tab));
    events.on("tabs:updated", ({ tab }) => interceptPdfTab(tab));

    // Clean up source URL when PDF tab is closed
    events.on("tabs:closed", ({ tabId }) => sourceUrlMap.delete(tabId));

    // ── PDF data fetching ─────────────────────────────────────────

    commands.handle(PDF_READER_FETCH, async ({ url }) => {
      const data = await fetchPdfData(url);
      const hash = computeHash(data);
      const filename = extractFilename(url);
      return {
        dataBase64: data.toString("base64"),
        hash,
        filename,
      };
    });

    // ── Index CRUD ────────────────────────────────────────────────

    async function getIndex(pdfKey: string): Promise<IndexEntry[]> {
      const doc = await indexCollection.findOne(pdfKey);
      return doc?.entries ?? [];
    }

    async function saveIndex(pdfKey: string, entries: IndexEntry[]): Promise<void> {
      await indexCollection.upsert({ id: pdfKey, entries });
      events.emit(PDF_READER_INDEX_CHANGED, { pdfKey, entries });
    }

    commands.handle(PDF_READER_GET_INDEX, async ({ pdfKey }) => {
      return getIndex(pdfKey);
    });

    commands.handle(PDF_READER_INDEX_ADD, async ({ pdfKey, label, page }) => {
      const entries = await getIndex(pdfKey);
      const newEntry: IndexEntry = {
        id: crypto.randomUUID(),
        label,
        page,
        order: entries.length,
      };
      entries.push(newEntry);
      await saveIndex(pdfKey, entries);
    });

    commands.handle(PDF_READER_INDEX_UPDATE, async ({ pdfKey, entryId, label, page }) => {
      const entries = await getIndex(pdfKey);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;
      if (label !== undefined) entry.label = label;
      if (page !== undefined) entry.page = page;
      await saveIndex(pdfKey, entries);
    });

    commands.handle(PDF_READER_INDEX_DELETE, async ({ pdfKey, entryId }) => {
      let entries = await getIndex(pdfKey);
      entries = entries.filter((e) => e.id !== entryId);
      // Re-order
      entries.forEach((e, i) => {
        e.order = i;
      });
      await saveIndex(pdfKey, entries);
    });

    commands.handle(PDF_READER_INDEX_REORDER, async ({ pdfKey, entryIds }) => {
      const entries = await getIndex(pdfKey);
      const byId = new Map(entries.map((e) => [e.id, e]));
      const reordered: IndexEntry[] = [];
      for (const id of entryIds) {
        const entry = byId.get(id);
        if (entry) {
          entry.order = reordered.length;
          reordered.push(entry);
        }
      }
      await saveIndex(pdfKey, reordered);
    });
  },
  teardown() {
    _state.reset();
  },
});

/** Get the URL the user was on before navigating to this PDF tab (for back navigation). */
export function getPdfSourceUrl(tabId: TabId): string | undefined {
  return _state.initialized ? _state.get().sourceUrlMap.get(tabId) : undefined;
}
