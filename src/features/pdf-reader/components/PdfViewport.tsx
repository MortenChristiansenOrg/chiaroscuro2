import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfDocument, SearchMatch } from "../backends/types";

const PAGE_GAP = 12;

interface PagePosition {
  y: number;
  width: number;
  height: number;
}

interface PdfViewportProps {
  document: PdfDocument;
  zoom: number;
  goToPage: number | null;
  searchMatches: Map<number, SearchMatch[]>;
  currentSearchMatch: { page: number; matchIndex: number } | null;
  onCurrentPageChange: (page: number) => void;
  onGoToPageComplete: () => void;
}

function PdfPage({
  document,
  pageIndex,
  zoom,
  style,
  searchMatches,
  isCurrentMatchPage,
}: {
  document: PdfDocument;
  pageIndex: number;
  zoom: number;
  style: React.CSSProperties;
  searchMatches?: SearchMatch[];
  isCurrentMatchPage: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef<{ pageIndex: number; zoom: number } | null>(null);

  // Render the page when it becomes visible or zoom changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (renderedRef.current?.pageIndex === pageIndex && renderedRef.current?.zoom === zoom) return;

    let cancelled = false;
    document
      .renderPage(pageIndex, zoom, canvas)
      .then(() => {
        if (!cancelled) {
          renderedRef.current = { pageIndex, zoom };
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

    for (const match of searchMatches) {
      for (const rect of match.rects) {
        ctx.fillStyle = isCurrentMatchPage ? "rgba(255, 165, 0, 0.4)" : "rgba(255, 255, 0, 0.3)";
        ctx.fillRect(rect.x * zoom, rect.y * zoom, rect.width * zoom, rect.height * zoom);
      }
    }
  }, [document, pageIndex, zoom, searchMatches, isCurrentMatchPage]);

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
      </div>
    </div>
  );
}

export function PdfViewport({
  document,
  zoom,
  goToPage,
  searchMatches,
  currentSearchMatch,
  onCurrentPageChange,
  onGoToPageComplete,
}: PdfViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Scroll handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => requestAnimationFrame(updateVisibleRange);
    container.addEventListener("scroll", onScroll, { passive: true });
    updateVisibleRange();
    return () => container.removeEventListener("scroll", onScroll);
  }, [updateVisibleRange]);

  // Go to page
  useEffect(() => {
    if (goToPage === null || !containerRef.current) return;
    const pageIdx = goToPage - 1; // 0-based
    const pos = pagePositions[pageIdx];
    if (!pos) return;
    containerRef.current.scrollTo({ top: pos.y - PAGE_GAP, behavior: "smooth" });
    onGoToPageComplete();
  }, [goToPage, pagePositions, onGoToPageComplete]);

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
              isCurrentMatchPage={currentSearchMatch?.page === pageIdx}
            />
          );
        })}
      </div>
    </div>
  );
}
