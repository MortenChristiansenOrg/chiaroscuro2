import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../renderer/src/components/Icon";

interface PdfToolbarProps {
  currentPage: number;
  pageCount: number;
  zoom: number;
  isSearching: boolean;
  initialSearchTerm: string;
  searchMatchCount: number;
  currentSearchMatch: number;
  indexVisible: boolean;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onSearch: (term: string) => void;
  onSearchInputChange: (term: string) => void;
  onSearchNext: () => void;
  onSearchPrevious: () => void;
  onSearchClear: () => void;
  onToggleIndex: () => void;
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.375rem 0.75rem",
  borderBottom: "1px solid var(--border)",
  backgroundColor: "var(--content-bg)",
  fontSize: "var(--text-sm)",
  color: "var(--foreground)",
  flexShrink: 0,
};

const buttonClass =
  "flex items-center justify-center min-w-[var(--click-target-min)] min-h-[var(--click-target-min)] px-1.5 py-1 rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--foreground)] cursor-pointer text-[length:var(--text-sm)] hover:bg-[oklch(0_0_0/0.06)] active:bg-[oklch(0_0_0/0.12)] disabled:opacity-40 disabled:cursor-default";

const inputStyle: React.CSSProperties = {
  padding: "0.25rem 0.5rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-mono)",
  outline: "none",
};

const separatorStyle: React.CSSProperties = {
  width: "1px",
  height: "1rem",
  backgroundColor: "var(--border)",
};

export function PdfToolbar({
  currentPage,
  pageCount,
  zoom,
  isSearching,
  initialSearchTerm,
  searchMatchCount,
  currentSearchMatch,
  indexVisible,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSearch,
  onSearchInputChange,
  onSearchNext,
  onSearchPrevious,
  onSearchClear,
  onToggleIndex,
}: PdfToolbarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [pageInput, setPageInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = Number.parseInt(pageInput, 10);
    if (page >= 1 && page <= pageCount) {
      onGoToPage(page);
      setPageInput("");
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim();
    if (term) {
      onSearch(term);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearchInputChange(value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const term = searchTerm.trim();
      if (term && searchMatchCount === 0) {
        onSearch(term);
      } else if (e.shiftKey) {
        onSearchPrevious();
      } else {
        onSearchNext();
      }
    } else if (e.key === "Escape") {
      setSearchTerm("");
      onSearchClear();
      searchInputRef.current?.blur();
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div style={toolbarStyle}>
      {/* Index toggle */}
      <button
        type="button"
        onClick={onToggleIndex}
        className={buttonClass}
        style={{
          backgroundColor: indexVisible ? "var(--accent)" : undefined,
          color: indexVisible ? "var(--accent-foreground)" : undefined,
        }}
        data-tip="Toggle index"
        aria-label="Toggle index"
      >
        <Icon name="list" />
      </button>

      <div style={separatorStyle} />

      {/* Page navigation */}
      <form
        onSubmit={handlePageSubmit}
        style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
      >
        <button
          type="button"
          onClick={() => onGoToPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className={buttonClass}
          data-tip="Previous page"
          aria-label="Previous page"
        >
          <Icon name="chevron-up" />
        </button>
        <input
          type="text"
          value={pageInput || String(currentPage)}
          onChange={(e) => setPageInput(e.target.value)}
          onFocus={(e) => {
            setPageInput(String(currentPage));
            e.target.select();
          }}
          onBlur={() => setPageInput("")}
          style={{ ...inputStyle, width: "3rem", textAlign: "center" }}
          aria-label="Page number"
        />
        <span style={{ color: "var(--muted-foreground)" }}>/ {pageCount}</span>
        <button
          type="button"
          onClick={() => onGoToPage(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage >= pageCount}
          className={buttonClass}
          data-tip="Next page"
          aria-label="Next page"
        >
          <Icon name="chevron-down" />
        </button>
      </form>

      <div style={separatorStyle} />

      {/* Zoom */}
      <button
        type="button"
        onClick={onZoomOut}
        className={buttonClass}
        data-tip="Zoom out"
        aria-label="Zoom out"
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        onClick={onZoomReset}
        className={buttonClass}
        style={{ fontFamily: "var(--font-mono)", minWidth: "3rem" }}
        data-tip="Reset zoom"
        aria-label="Reset zoom"
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className={buttonClass}
        data-tip="Zoom in"
        aria-label="Zoom in"
      >
        <Icon name="plus" />
      </button>

      <div style={separatorStyle} />

      {/* Search */}
      <form
        onSubmit={handleSearchSubmit}
        style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
      >
        <div style={{ position: "relative" }}>
          <Icon
            name="magnifying-glass"
            css={{
              position: "absolute",
              left: "0.5rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-foreground)",
              fontSize: "var(--text-xs)",
              pointerEvents: "none",
            }}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            style={{ ...inputStyle, paddingLeft: "1.5rem", width: "10rem" }}
            aria-label="Search in PDF"
          />
        </div>
        {searchTerm && (
          <>
            <span
              style={{
                color: "var(--muted-foreground)",
                fontSize: "var(--text-xs)",
                whiteSpace: "nowrap",
                minWidth: "3.75rem",
              }}
              aria-live="polite"
            >
              {isSearching
                ? "Searching..."
                : searchMatchCount > 0
                  ? `${currentSearchMatch} / ${searchMatchCount}`
                  : "No matches"}
            </span>
            <button
              type="button"
              onClick={onSearchPrevious}
              disabled={isSearching || searchMatchCount === 0}
              className={buttonClass}
              data-tip="Previous match"
              aria-label="Previous match"
            >
              <Icon name="chevron-up" />
            </button>
            <button
              type="button"
              onClick={onSearchNext}
              disabled={isSearching || searchMatchCount === 0}
              className={buttonClass}
              data-tip="Next match"
              aria-label="Next match"
            >
              <Icon name="chevron-down" />
            </button>
          </>
        )}
      </form>
    </div>
  );
}
