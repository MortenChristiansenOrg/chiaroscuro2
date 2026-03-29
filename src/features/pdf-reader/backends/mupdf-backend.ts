import * as mupdf from "mupdf";
import type { OutlineEntry, PageDimensions, PdfBackend, PdfDocument, SearchMatch } from "./types";

interface MupdfOutlineItem {
  title: string | undefined;
  uri: string | undefined;
  open: boolean;
  down?: MupdfOutlineItem[];
  page?: number;
}

class MupdfDocument implements PdfDocument {
  private pageDimsCache = new Map<number, PageDimensions>();

  constructor(private doc: mupdf.PDFDocument) {}

  get pageCount(): number {
    return this.doc.countPages();
  }

  async getOutline(): Promise<OutlineEntry[]> {
    const outline = this.doc.loadOutline() as MupdfOutlineItem[] | null;
    if (!outline) return [];
    return this.flattenOutline(outline);
  }

  private flattenOutline(items: MupdfOutlineItem[]): OutlineEntry[] {
    const entries: OutlineEntry[] = [];
    for (const item of items) {
      if (item.title) {
        entries.push({
          title: item.title,
          page: typeof item.page === "number" ? item.page + 1 : 0, // Convert to 1-based
        });
      }
      if (item.down) {
        entries.push(...this.flattenOutline(item.down));
      }
    }
    return entries;
  }

  getPageDimensions(pageIndex: number): PageDimensions {
    const cached = this.pageDimsCache.get(pageIndex);
    if (cached) return cached;
    const page = this.doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const dims = {
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
    };
    this.pageDimsCache.set(pageIndex, dims);
    return dims;
  }

  async renderPage(pageIndex: number, scale: number, canvas: HTMLCanvasElement): Promise<void> {
    const page = this.doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    const width = (bounds[2] - bounds[0]) * scale;
    const height = (bounds[3] - bounds[1]) * scale;

    // Store unscaled dims
    this.pageDimsCache.set(pageIndex, {
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
    });

    const pixelWidth = Math.floor(width * devicePixelRatio);
    const pixelHeight = Math.floor(height * devicePixelRatio);

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const matrix = mupdf.Matrix.scale(scale * devicePixelRatio, scale * devicePixelRatio);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, true);
    const pixels = pixmap.getPixels();

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Copy pixel data to a fresh ArrayBuffer to satisfy ImageData's type constraints
    const pixelData = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);
    pixelData.set(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    const imageData = new ImageData(pixelData, pixelWidth, pixelHeight);
    ctx.putImageData(imageData, 0, 0);
  }

  async getPageText(pageIndex: number): Promise<string> {
    const page = this.doc.loadPage(pageIndex);
    const stext = page.toStructuredText("preserve-whitespace");
    return stext.asText();
  }

  async searchPage(pageIndex: number, term: string): Promise<SearchMatch[]> {
    const page = this.doc.loadPage(pageIndex);
    const results = page.search(term);
    return results.map((quads) => ({
      rects: quads.map((quad) => {
        // Quad is [ulx, uly, urx, ury, llx, lly, lrx, lry]
        const x = Math.min(quad[0], quad[4]);
        const y = Math.min(quad[1], quad[3]);
        const right = Math.max(quad[2], quad[6]);
        const bottom = Math.max(quad[5], quad[7]);
        return { x, y, width: right - x, height: bottom - y };
      }),
    }));
  }

  destroy(): void {
    // mupdf PDFDocument doesn't have an explicit destroy — GC handles it
  }
}

export const mupdfBackend: PdfBackend = {
  async loadDocument(data: Uint8Array): Promise<PdfDocument> {
    const doc = new mupdf.PDFDocument(data);
    return new MupdfDocument(doc);
  },
};
