import { useCallback, useEffect, useRef, useState } from "react";
import type { BuiltInPageProps } from "../../renderer/src/components/BuiltInPage";
import type { PdfBackend, PdfDocument, SearchMatch } from "./backends/types";
import { IndexSidebar } from "./components/IndexSidebar";
import { PdfToolbar } from "./components/PdfToolbar";
import { PdfViewport } from "./components/PdfViewport";
import type { IndexEntry, PdfBackendType } from "./pdf-reader.shared";
import { usePdfReaderStore } from "./pdf-reader.store";

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const DEFAULT_ZOOM = 1;

// Cache loaded PDF documents so tab switches don't re-fetch/re-parse
const documentCache = new Map<string, { document: PdfDocument; pdfKey: string }>();

async function loadBackend(type: PdfBackendType): Promise<PdfBackend> {
  if (type === "mupdf") {
    const { mupdfBackend } = await import("./backends/mupdf-backend");
    return mupdfBackend;
  }
  const { pdfjsBackend } = await import("./backends/pdfjs-backend");
  return pdfjsBackend;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function PdfReaderPage({ params }: BuiltInPageProps) {
  const pdfUrl = params.url;
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [pdfKey, setPdfKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [goToPage, setGoToPage] = useState<number | null>(null);
  const [indexVisible, setIndexVisible] = useState(true);
  const [searchMatches, setSearchMatches] = useState<Map<number, SearchMatch[]>>(new Map());
  const [allMatches, setAllMatches] = useState<{ page: number; matchIndex: number }[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
  const [searchTerm, setSearchTerm] = useState("");
  const documentRef = useRef<PdfDocument | null>(null);

  // Get index entries from store
  const entries = usePdfReaderStore((s) => (pdfKey ? s.indexes.get(pdfKey) : undefined)) ?? [];

  // Load PDF (reuses cached document on tab re-activation)
  useEffect(() => {
    if (!pdfUrl) {
      setError("No PDF URL provided");
      setLoading(false);
      return;
    }

    const url = pdfUrl;

    // Check cache first
    const cached = documentCache.get(url);
    if (cached) {
      documentRef.current = cached.document;
      setDocument(cached.document);
      setPdfKey(cached.pdfKey);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Fetch PDF data from main process
        const response = await window.chiaroscuro.sendCommand("pdf-reader:fetch", { url });
        if (cancelled) return;

        const { dataBase64, hash, filename } = response as {
          dataBase64: string;
          hash: string;
          filename: string;
        };

        const key = `${filename}:${hash}`;
        setPdfKey(key);

        // Determine backend from settings
        const settings = (await window.chiaroscuro.sendCommand("settings:get", undefined)) as {
          pdfBackend?: PdfBackendType;
        };
        if (cancelled) return;

        const backendType: PdfBackendType = settings?.pdfBackend ?? "pdfjs";
        const backend = await loadBackend(backendType);
        if (cancelled) return;

        const data = base64ToUint8Array(dataBase64);
        const doc = await backend.loadDocument(data);
        if (cancelled) {
          doc.destroy();
          return;
        }

        documentRef.current = doc;
        setDocument(doc);
        documentCache.set(url, { document: doc, pdfKey: key });

        // Load existing index or populate from outline
        const existingIndex = (await window.chiaroscuro.sendCommand("pdf-reader:get-index", {
          pdfKey: key,
        })) as IndexEntry[];
        if (cancelled) return;

        if (existingIndex.length === 0) {
          // Populate from PDF outline
          const outline = await doc.getOutline();
          for (const entry of outline) {
            if (cancelled) return;
            await window.chiaroscuro.sendCommand("pdf-reader:index-add", {
              pdfKey: key,
              label: entry.title,
              page: entry.page,
            });
          }
        } else {
          // Seed the store with persisted entries (events only fire on mutations)
          usePdfReaderStore.setState((state) => {
            const indexes = new Map(state.indexes);
            indexes.set(key, existingIndex);
            return { indexes };
          });
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      // Don't destroy — document stays in cache for tab re-activation
      documentRef.current = null;
    };
  }, [pdfUrl]);

  // Search
  const runSearch = useCallback(
    async (term: string) => {
      if (!document || !term) {
        setSearchMatches(new Map());
        setAllMatches([]);
        setCurrentMatchIdx(-1);
        setSearchTerm("");
        return;
      }

      setSearchTerm(term);
      const matches = new Map<number, SearchMatch[]>();
      const flatMatches: { page: number; matchIndex: number }[] = [];

      for (let i = 0; i < document.pageCount; i++) {
        const pageMatches = await document.searchPage(i, term);
        if (pageMatches.length > 0) {
          matches.set(i, pageMatches);
          for (let m = 0; m < pageMatches.length; m++) {
            flatMatches.push({ page: i, matchIndex: m });
          }
        }
      }

      setSearchMatches(matches);
      setAllMatches(flatMatches);
      setCurrentMatchIdx(flatMatches.length > 0 ? 0 : -1);

      // Jump to first match
      if (flatMatches.length > 0 && flatMatches[0]) {
        setGoToPage(flatMatches[0].page + 1);
      }
    },
    [document],
  );

  const searchNext = useCallback(() => {
    if (allMatches.length === 0) return;
    const next = (currentMatchIdx + 1) % allMatches.length;
    setCurrentMatchIdx(next);
    const match = allMatches[next];
    if (match) setGoToPage(match.page + 1);
  }, [allMatches, currentMatchIdx]);

  const searchPrevious = useCallback(() => {
    if (allMatches.length === 0) return;
    const prev = (currentMatchIdx - 1 + allMatches.length) % allMatches.length;
    setCurrentMatchIdx(prev);
    const match = allMatches[prev];
    if (match) setGoToPage(match.page + 1);
  }, [allMatches, currentMatchIdx]);

  const searchClear = useCallback(() => {
    setSearchMatches(new Map());
    setAllMatches([]);
    setCurrentMatchIdx(-1);
    setSearchTerm("");
  }, []);

  // Index handlers
  const handleIndexAdd = useCallback(
    (label: string, page: number) => {
      if (!pdfKey) return;
      window.chiaroscuro.sendCommand("pdf-reader:index-add", { pdfKey, label, page });
    },
    [pdfKey],
  );

  const handleIndexUpdate = useCallback(
    (entryId: string, label: string) => {
      if (!pdfKey) return;
      window.chiaroscuro.sendCommand("pdf-reader:index-update", { pdfKey, entryId, label });
    },
    [pdfKey],
  );

  const handleIndexDelete = useCallback(
    (entryId: string) => {
      if (!pdfKey) return;
      window.chiaroscuro.sendCommand("pdf-reader:index-delete", { pdfKey, entryId });
    },
    [pdfKey],
  );

  const handleIndexReorder = useCallback(
    (entryIds: string[]) => {
      if (!pdfKey) return;
      window.chiaroscuro.sendCommand("pdf-reader:index-reorder", { pdfKey, entryIds });
    },
    [pdfKey],
  );

  const handleGoToPageComplete = useCallback(() => setGoToPage(null), []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted-foreground)",
          fontSize: "var(--text-sm)",
        }}
      >
        Loading PDF...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "0.75rem",
          color: "var(--destructive)",
          fontSize: "var(--text-sm)",
        }}
      >
        <span>Failed to load PDF</span>
        <span style={{ color: "var(--muted-foreground)", fontSize: "var(--text-xs)" }}>
          {error}
        </span>
      </div>
    );
  }

  if (!document) return null;

  const currentSearchMatchInfo =
    currentMatchIdx >= 0 ? (allMatches[currentMatchIdx] ?? null) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PdfToolbar
        currentPage={currentPage}
        pageCount={document.pageCount}
        zoom={zoom}
        searchMatchCount={allMatches.length}
        currentSearchMatch={currentMatchIdx >= 0 ? currentMatchIdx + 1 : 0}
        indexVisible={indexVisible}
        onGoToPage={(p) => setGoToPage(p)}
        onZoomIn={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
        onZoomOut={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
        onZoomReset={() => setZoom(DEFAULT_ZOOM)}
        onSearch={runSearch}
        onSearchNext={searchNext}
        onSearchPrevious={searchPrevious}
        onSearchClear={searchClear}
        onToggleIndex={() => setIndexVisible((v) => !v)}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {indexVisible && (
          <IndexSidebar
            entries={entries}
            currentPage={currentPage}
            onNavigate={(page) => setGoToPage(page)}
            onAdd={handleIndexAdd}
            onUpdate={handleIndexUpdate}
            onDelete={handleIndexDelete}
            onReorder={handleIndexReorder}
          />
        )}
        <PdfViewport
          document={document}
          zoom={zoom}
          goToPage={goToPage}
          searchMatches={searchMatches}
          currentSearchMatch={currentSearchMatchInfo}
          onCurrentPageChange={setCurrentPage}
          onGoToPageComplete={handleGoToPageComplete}
        />
      </div>
    </div>
  );
}
