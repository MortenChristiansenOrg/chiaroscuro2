# Specification for PDF Reader Feature

## Overview

Custom PDF reader replacing Chromium's built-in PDF viewer. Supports two rendering backends (pdf.js and mupdf) selectable via settings. Provides a custom index/outline sidebar that users can edit and extend, stored by PDF name + content hash for portability. Optimized for large, graphics-heavy PDFs.

## Terminology

- **PDF backend**: The rendering engine used to display PDF pages (pdf.js or mupdf).
- **Custom index**: A user-editable table of contents for a PDF, initially populated from the PDF's built-in outline.
- **PDF hash**: A lightweight hash computed from the first 64KB + file size, used with the filename to identify a PDF across locations.
- **Page viewport**: The visible area showing rendered PDF pages with virtual scrolling.

## Requirements

- All PDFs (local files and remote URLs) must be intercepted and rendered using the custom reader instead of Chromium's built-in viewer.
- Two rendering backends must be available: pdf.js and mupdf (WASM). The active backend is selected in settings.
- PDF pages render to `<canvas>` elements with virtual scrolling (only visible pages + buffer rendered).
- Text selection and copy must work on rendered pages.
- In-PDF search (Ctrl+F integration) must highlight matches and navigate between them.
- Zoom in/out/reset must work, independent of the browser's tab zoom.
- A sidebar within the PDF content area shows the custom index.
- The custom index is pre-populated from the PDF's built-in outline/bookmarks on first open.
- Users can rename, reorder, delete, and add index entries. Each entry has a label and page number.
- Custom index data is persisted locally, keyed by `{filename}:{hash}`.
- Moving or copying a PDF preserves the custom index (same content = same hash).
- Performance: lazy page rendering, off-screen page cleanup, web worker for parsing.

## Workflows

### Open a PDF

- Navigate to a PDF URL or open a local PDF file.
- The main process intercepts the PDF response/navigation.
- The PDF data is loaded and passed to the active rendering backend.
- Pages render in a scrollable viewport with the index sidebar visible.

### Switch rendering backend

- Open settings, change the PDF backend toggle (pdf.js / mupdf).
- The next PDF opened uses the new backend. Already-open PDFs continue with their current backend.

### Edit custom index

- Click an index entry to navigate to that page.
- Right-click an entry to rename or delete it.
- Click "Add entry" to create a new entry at the current page.
- Drag entries to reorder.
- Changes are saved automatically.

### Search in PDF

- Press Ctrl+F while a PDF tab is active.
- The find bar appears. Type a search term.
- Matches are highlighted on rendered pages. Navigate with Enter/Shift+Enter.

### Zoom

- Ctrl+Plus / Ctrl+Minus / Ctrl+0 to zoom in, out, and reset.
- Zoom applies to the PDF viewport only.

## Interactions

### Keyboard shortcuts

- **Ctrl+F**: Start search within PDF.
- **Ctrl+Plus**: Zoom in.
- **Ctrl+Minus**: Zoom out.
- **Ctrl+0**: Reset zoom to fit-width.
- **Ctrl+G**: Toggle index sidebar.
- **Page Up / Page Down**: Scroll by page.
- **Home / End**: Go to first / last page.

### Mouse interactions

- **Scroll**: Navigate pages vertically.
- **Click index entry**: Jump to page.
- **Right-click index entry**: Context menu (rename, delete).
- **Click "Add entry"**: Add index entry at current page.
- **Drag index entry**: Reorder.
- **Text select + Ctrl+C**: Copy selected text.

### Cross-feature interactions

- **Tabs**: PDF reader renders as a built-in page when a PDF tab is active. The tab title shows the PDF filename.
- **Settings**: PDF backend preference stored in settings.
- **Find Text**: PDF reader handles search internally since the content is canvas-based, not DOM text. The existing find-text feature is suppressed for PDF tabs.
- **Zoom**: PDF reader manages its own zoom, independent of the tab zoom feature.

## Commands & Events

### Commands

- `pdf-reader:open` — Open a PDF in the reader. Payload: `{ tabId: TabId, url: string }`.
- `pdf-reader:goto-page` — Navigate to a specific page. Payload: `{ tabId: TabId, page: number }`.
- `pdf-reader:zoom` — Set zoom level. Payload: `{ tabId: TabId, zoom: number }`.
- `pdf-reader:search` — Search within PDF. Payload: `{ tabId: TabId, term: string }`.
- `pdf-reader:search-next` — Navigate to next search match. Payload: `{ tabId: TabId }`.
- `pdf-reader:search-previous` — Navigate to previous search match. Payload: `{ tabId: TabId }`.
- `pdf-reader:search-stop` — Stop searching. Payload: `{ tabId: TabId }`.
- `pdf-reader:index-add` — Add an index entry. Payload: `{ tabId: TabId, label: string, page: number }`.
- `pdf-reader:index-update` — Update an index entry. Payload: `{ tabId: TabId, entryId: string, label?: string, page?: number, order?: number }`.
- `pdf-reader:index-delete` — Delete an index entry. Payload: `{ tabId: TabId, entryId: string }`.
- `pdf-reader:index-reorder` — Reorder index entries. Payload: `{ tabId: TabId, entryIds: string[] }`.
- `pdf-reader:get-index` — Get the custom index for a PDF. Payload: `{ tabId: TabId }`.

### Events

- `pdf-reader:loaded` — PDF loaded and ready. Payload: `{ tabId: TabId, pageCount: number, title: string, hash: string }`.
- `pdf-reader:page-changed` — Visible page changed. Payload: `{ tabId: TabId, currentPage: number }`.
- `pdf-reader:zoom-changed` — Zoom level changed. Payload: `{ tabId: TabId, zoom: number }`.
- `pdf-reader:search-result` — Search results updated. Payload: `{ tabId: TabId, matches: number, currentMatch: number }`.
- `pdf-reader:index-changed` — Custom index updated. Payload: `{ tabId: TabId, entries: IndexEntry[] }`.

## Resolved Decisions

- Index entries are flat (no nesting), even if the PDF outline is hierarchical.
- Search and zoom use native functionality from the rendering backend (pdf.js / mupdf APIs).
- No annotation support planned.

## Unresolved Issues

- How should printing work — delegate to the backend or use Electron's print API on the original PDF data?
- Should there be a "page thumbnails" strip as an alternative to the outline sidebar?
