import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PdfDocument, SearchMatch, TextItem } from "../backends/types";

const PAGE_GAP = 12;

interface PagePosition {
  y: number;
  width: number;
  height: number;
}

interface PdfViewportProps {
  document: PdfDocument;
  zoom: number;
  initialScrollTop: number;
  goToPage: number | null;
  searchMatches: Map<number, SearchMatch[]>;
  currentSearchMatch: { page: number; matchIndex: number } | null;
  onCurrentPageChange: (page: number) => void;
  onScrollPositionChange: (scrollTop: number) => void;
  onGoToPageComplete: () => void;
}

/** Transparent text layer for selection/copy support */
function TextLayer({ items, zoom }: { items: TextItem[]; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure each span's natural width and apply scaleX to match PDF layout
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
      const span = children[i] as HTMLElement;
      const item = items[i];
      if (!item || !span) continue;
      // Reset transform before measuring
      span.style.transform = "";
      const actualWidth = span.offsetWidth;
      const expectedWidth = item.width * zoom;
      if (actualWidth > 0 && expectedWidth > 0) {
        span.style.transform = `scaleX(${expectedWidth / actualWidth})`;
      }
    }
  }, [items, zoom]);

  return (
    <div
      ref={containerRef}
      className="pdf-text-layer"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        pointerEvents: "none",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {items.map((item) => (
        <span
          key={`${item.x}:${item.y}:${item.width}`}
          style={{
            position: "absolute",
            left: item.x * zoom,
            top: item.y * zoom,
            fontSize: item.height * zoom,
            fontFamily: "sans-serif",
            lineHeight: 1,
            whiteSpace: "pre",
            color: "transparent",
            transformOrigin: "left top",
            pointerEvents: "auto",
          }}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}

function PdfPage({
  document,
  pageIndex,
  zoom,
  style,
  searchMatches,
  currentMatchIndex,
}: {
  document: PdfDocument;
  pageIndex: number;
  zoom: number;
  style: React.CSSProperties;
  searchMatches?: SearchMatch[];
  currentMatchIndex: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef<{
    document: PdfDocument;
    pageIndex: number;
    zoom: number;
  } | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);

  // Load text items for selection layer
  useEffect(() => {
    let cancelled = false;
    document.getPageTextItems(pageIndex).then((items) => {
      if (!cancelled) setTextItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, [document, pageIndex]);

  // Render the page when it becomes visible or zoom changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (
      renderedRef.current?.document === document &&
      renderedRef.current?.pageIndex === pageIndex &&
      renderedRef.current?.zoom === zoom
    )
      return;

    let cancelled = false;
    document
      .renderPage(pageIndex, zoom, canvas)
      .then(() => {
        if (!cancelled) {
          renderedRef.current = { document, pageIndex, zoom };
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("[pdf-reader] render page failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [document, pageIndex, zoom]);

  // Draw search highlights
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const dims = document.getPageDimensions(pageIndex);
    overlay.width = Math.floor(dims.width * zoom * devicePixelRatio);
    overlay.height = Math.floor(dims.height * zoom * devicePixelRatio);
    overlay.style.width = `${dims.width * zoom}px`;
    overlay.style.height = `${dims.height * zoom}px`;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!searchMatches?.length) return;

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    for (let matchIndex = 0; matchIndex < searchMatches.length; matchIndex++) {
      const match = searchMatches[matchIndex];
      if (!match) continue;
      const isCurrentMatch = currentMatchIndex === matchIndex;
      for (const rect of match.rects) {
        ctx.fillStyle = isCurrentMatch ? "rgba(255, 133, 27, 0.62)" : "rgba(255, 226, 77, 0.34)";
        ctx.fillRect(rect.x * zoom, rect.y * zoom, rect.width * zoom, rect.height * zoom);
        if (isCurrentMatch) {
          ctx.strokeStyle = "rgba(194, 65, 12, 0.9)";
          ctx.lineWidth = 1;
          ctx.strokeRect(rect.x * zoom, rect.y * zoom, rect.width * zoom, rect.height * zoom);
        }
      }
    }
  }, [document, pageIndex, zoom, searchMatches, currentMatchIndex]);

  return (
    <div
      style={{
        ...style,
        display: "flex",
        justifyContent: "center",
        position: "absolute",
      }}
    >
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-subtle)",
          }}
        />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
          }}
        />
        {textItems.length > 0 && <TextLayer items={textItems} zoom={zoom} />}
      </div>
    </div>
  );
}

export function PdfViewport({
  document,
  zoom,
  initialScrollTop,
  goToPage,
  searchMatches,
  currentSearchMatch,
  onCurrentPageChange,
  onScrollPositionChange,
  onGoToPageComplete,
}: PdfViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 1 });
  const [containerWidth, setContainerWidth] = useState(0);

  // Calculate page positions at current zoom
  const pagePositions = useMemo((): PagePosition[] => {
    let y = PAGE_GAP;
    return Array.from({ length: document.pageCount }, (_, i) => {
      const dims = document.getPageDimensions(i);
      const height = dims.height * zoom;
      const width = dims.width * zoom;
      const pos = { y, width, height };
      y += height + PAGE_GAP;
      return pos;
    });
  }, [document, zoom]);

  const totalHeight = useMemo(() => {
    const last = pagePositions[pagePositions.length - 1];
    if (!last) return 0;
    return last.y + last.height + PAGE_GAP;
  }, [pagePositions]);

  // Track container width for centering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    setContainerWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Calculate visible range from scroll position
  const updateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || pagePositions.length === 0) return;

    const scrollTop = container.scrollTop;
    const viewHeight = container.clientHeight;
    const buffer = viewHeight; // 1 viewport buffer

    let start = 0;
    let end = pagePositions.length;

    for (let i = 0; i < pagePositions.length; i++) {
      const pos = pagePositions[i];
      if (pos && pos.y + pos.height >= scrollTop - buffer) {
        start = i;
        break;
      }
    }

    for (let i = start; i < pagePositions.length; i++) {
      const pos = pagePositions[i];
      if (pos && pos.y > scrollTop + viewHeight + buffer) {
        end = i;
        break;
      }
    }

    setVisibleRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));

    // Determine current page (the one with most area visible)
    let bestPage = 0;
    let bestArea = 0;
    for (let i = start; i < end; i++) {
      const pos = pagePositions[i];
      if (!pos) continue;
      const visibleTop = Math.max(pos.y, scrollTop);
      const visibleBottom = Math.min(pos.y + pos.height, scrollTop + viewHeight);
      const area = Math.max(0, visibleBottom - visibleTop);
      if (area > bestArea) {
        bestArea = area;
        bestPage = i + 1; // 1-based
      }
    }
    if (bestPage > 0) {
      onCurrentPageChange(bestPage);
    }
  }, [pagePositions, onCurrentPageChange]);

  // Restore the last scroll position after page geometry is known.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || restoredScrollRef.current || pagePositions.length === 0) return;
    container.scrollTop = Math.max(
      0,
      Math.min(initialScrollTop, totalHeight - container.clientHeight),
    );
    restoredScrollRef.current = true;
    updateVisibleRange();
  }, [initialScrollTop, pagePositions.length, totalHeight, updateVisibleRange]);

  // Scroll handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const scrollTop = container.scrollTop;
      onScrollPositionChange(scrollTop);
      requestAnimationFrame(updateVisibleRange);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    updateVisibleRange();
    return () => container.removeEventListener("scroll", onScroll);
  }, [updateVisibleRange, onScrollPositionChange]);

  // Go to page
  useEffect(() => {
    if (goToPage === null || !containerRef.current) return;
    const pageIdx = goToPage - 1; // 0-based
    const pos = pagePositions[pageIdx];
    if (!pos) return;
    containerRef.current.scrollTo({ top: pos.y - PAGE_GAP, behavior: "instant" });
    onScrollPositionChange(containerRef.current.scrollTop);
    onGoToPageComplete();
  }, [goToPage, pagePositions, onGoToPageComplete, onScrollPositionChange]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "auto",
        backgroundColor: "var(--muted)",
      }}
    >
      <div style={{ height: totalHeight, position: "relative", minWidth: "fit-content" }}>
        {Array.from({ length: visibleRange.end - visibleRange.start }, (_, i) => {
          const pageIdx = visibleRange.start + i;
          const pos = pagePositions[pageIdx];
          if (!pos) return null;
          const pageMatches = searchMatches.get(pageIdx);
          return (
            <PdfPage
              key={pageIdx}
              document={document}
              pageIndex={pageIdx}
              zoom={zoom}
              style={{
                top: pos.y,
                left: 0,
                right: 0,
                height: pos.height,
              }}
              searchMatches={pageMatches}
              currentMatchIndex={
                currentSearchMatch?.page === pageIdx ? currentSearchMatch.matchIndex : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}
