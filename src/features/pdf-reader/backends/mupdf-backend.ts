import "./mupdf-wasm-config"; // Must precede mupdf — see file for details
import * as mupdf from "mupdf";
import type {
  OutlineEntry,
  PageDimensions,
  PdfBackend,
  PdfDocument,
  SearchMatch,
  TextItem,
} from "./types";

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

    // Store unscaled dims
    this.pageDimsCache.set(pageIndex, {
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
    });

    const matrix = mupdf.Matrix.scale(scale * devicePixelRatio, scale * devicePixelRatio);
    // alpha=false renders onto white background; produces RGB (3 bytes/pixel)
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);

    // Use pixmap's actual dimensions to avoid rounding mismatches
    const pw = pixmap.getWidth();
    const ph = pixmap.getHeight();

    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = `${(bounds[2] - bounds[0]) * scale}px`;
    canvas.style.height = `${(bounds[3] - bounds[1]) * scale}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Convert RGB (3 bytes/pixel) → RGBA (4 bytes/pixel) for ImageData
    const pixels = pixmap.getPixels();
    const total = pw * ph;
    const pixelData = new Uint8ClampedArray(total * 4);
    for (let i = 0; i < total; i++) {
      const src = i * 3;
      const dst = i * 4;
      pixelData[dst] = pixels[src] ?? 0;
      pixelData[dst + 1] = pixels[src + 1] ?? 0;
      pixelData[dst + 2] = pixels[src + 2] ?? 0;
      pixelData[dst + 3] = 255;
    }
    const imageData = new ImageData(pixelData, pw, ph);
    ctx.putImageData(imageData, 0, 0);
  }

  async getPageText(pageIndex: number): Promise<string> {
    const page = this.doc.loadPage(pageIndex);
    const stext = page.toStructuredText("preserve-whitespace");
    return stext.asText();
  }

  async getPageTextItems(pageIndex: number): Promise<TextItem[]> {
    const page = this.doc.loadPage(pageIndex);
    const stext = page.toStructuredText("preserve-whitespace");
    const items: TextItem[] = [];

    let lineChars = "";
    let lineBbox: [number, number, number, number] = [0, 0, 0, 0];

    stext.walk({
      beginLine(bbox: [number, number, number, number]) {
        lineChars = "";
        lineBbox = bbox;
      },
      onChar(c: string) {
        lineChars += c;
      },
      endLine() {
        if (lineChars.trim()) {
          items.push({
            text: lineChars,
            x: lineBbox[0],
            y: lineBbox[1],
            width: lineBbox[2] - lineBbox[0],
            height: lineBbox[3] - lineBbox[1],
          });
        }
      },
    });

    return items;
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
