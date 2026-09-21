import "./mupdf-wasm-config"; // Must initialize before the MuPDF module.
import * as mupdf from "mupdf";
import type { OutlineEntry, PageDimensions, PdfDocument, SearchMatch, TextItem } from "./types";

class MupdfDocument implements PdfDocument {
  private readonly pageDimsCache = new Map<number, PageDimensions>();

  constructor(private readonly doc: mupdf.PDFDocument) {}

  get pageCount(): number {
    return this.doc.countPages();
  }

  private withPage<T>(pageIndex: number, action: (page: mupdf.PDFPage) => T): T {
    const page = this.doc.loadPage(pageIndex);
    try {
      return action(page);
    } finally {
      page.destroy();
    }
  }

  async getOutline(): Promise<OutlineEntry[]> {
    const entries: OutlineEntry[] = [];
    const flatten = (items: NonNullable<ReturnType<mupdf.PDFDocument["loadOutline"]>>) => {
      for (const item of items) {
        if (item.title && typeof item.page === "number" && item.page >= 0) {
          entries.push({ title: item.title, page: item.page + 1 });
        }
        if (item.down) flatten(item.down);
      }
    };
    flatten(this.doc.loadOutline() ?? []);
    return entries;
  }

  getPageDimensions(pageIndex: number): PageDimensions {
    const cached = this.pageDimsCache.get(pageIndex);
    if (cached) return cached;
    return this.withPage(pageIndex, (page) => {
      const bounds = page.getBounds();
      const dims = { width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] };
      this.pageDimsCache.set(pageIndex, dims);
      return dims;
    });
  }

  async renderPage(pageIndex: number, scale: number, canvas: HTMLCanvasElement): Promise<void> {
    this.withPage(pageIndex, (page) => {
      const bounds = page.getBounds();
      const pixelScale = scale * devicePixelRatio;
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(pixelScale, pixelScale),
        mupdf.ColorSpace.DeviceRGB,
        false,
      );
      try {
        canvas.width = pixmap.getWidth();
        canvas.height = pixmap.getHeight();
        canvas.style.width = `${(bounds[2] - bounds[0]) * scale}px`;
        canvas.style.height = `${(bounds[3] - bounds[1]) * scale}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // MuPDF's opaque RGB output preserves white paper. Canvas requires RGBA.
        const pixels = pixmap.getPixels();
        const rgba = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        for (let src = 0, dst = 0; dst < rgba.length; src += 3, dst += 4) {
          rgba[dst] = pixels[src] ?? 0;
          rgba[dst + 1] = pixels[src + 1] ?? 0;
          rgba[dst + 2] = pixels[src + 2] ?? 0;
          rgba[dst + 3] = 255;
        }
        ctx.putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0);
      } finally {
        pixmap.destroy();
      }
    });
  }

  async getPageText(pageIndex: number): Promise<string> {
    return this.withPage(pageIndex, (page) => {
      const text = page.toStructuredText("preserve-whitespace");
      try {
        return text.asText();
      } finally {
        text.destroy();
      }
    });
  }

  async getPageTextItems(pageIndex: number): Promise<TextItem[]> {
    return this.withPage(pageIndex, (page) => {
      const bounds = page.getBounds();
      const text = page.toStructuredText("preserve-whitespace");
      try {
        const items: TextItem[] = [];
        let line = "";
        let box: mupdf.Rect = [0, 0, 0, 0];
        text.walk({
          beginLine(bbox) {
            line = "";
            box = bbox;
          },
          onChar(char) {
            line += char;
          },
          endLine() {
            if (line.trim()) {
              items.push({
                text: line,
                x: box[0] - bounds[0],
                y: box[1] - bounds[1],
                width: box[2] - box[0],
                height: box[3] - box[1],
              });
            }
          },
        });
        return items;
      } finally {
        text.destroy();
      }
    });
  }

  async searchPage(pageIndex: number, term: string): Promise<SearchMatch[]> {
    if (!term) return [];
    return this.withPage(pageIndex, (page) => {
      const bounds = page.getBounds();
      return page.search(term, {}).map((quads) => ({
        rects: quads.map((quad) => {
          const left = Math.min(quad[0], quad[2], quad[4], quad[6]);
          const top = Math.min(quad[1], quad[3], quad[5], quad[7]);
          const right = Math.max(quad[0], quad[2], quad[4], quad[6]);
          const bottom = Math.max(quad[1], quad[3], quad[5], quad[7]);
          return {
            x: left - bounds[0],
            y: top - bounds[1],
            width: right - left,
            height: bottom - top,
          };
        }),
      }));
    });
  }

  async destroy(): Promise<void> {
    this.pageDimsCache.clear();
    this.doc.destroy();
  }
}

export async function loadPdfDocument(data: Uint8Array): Promise<PdfDocument> {
  return new MupdfDocument(new mupdf.PDFDocument(data));
}
