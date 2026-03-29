export interface PdfBackend {
  loadDocument(data: Uint8Array): Promise<PdfDocument>;
}

export interface PdfDocument {
  readonly pageCount: number;
  getOutline(): Promise<OutlineEntry[]>;
  getPageDimensions(pageIndex: number): PageDimensions;
  renderPage(pageIndex: number, scale: number, canvas: HTMLCanvasElement): Promise<void>;
  getPageText(pageIndex: number): Promise<string>;
  searchPage(pageIndex: number, term: string): Promise<SearchMatch[]>;
  destroy(): void;
}

export interface OutlineEntry {
  title: string;
  page: number;
}

export interface PageDimensions {
  width: number;
  height: number;
}

export interface SearchMatch {
  /** Highlight rectangles in page coordinates (unscaled) */
  rects: { x: number; y: number; width: number; height: number }[];
}
