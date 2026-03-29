import "./map-polyfill"; // Must precede pdfjs-dist — see file for details
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { OutlineEntry, PageDimensions, PdfBackend, PdfDocument, SearchMatch } from "./types";

// pdfjs-dist v5.5+ uses Map.getOrInsertComputed which Electron 40 doesn't
// support. Wrap the worker in a Blob that injects the polyfill before loading.
const fullWorkerUrl = new URL(workerUrl, globalThis.location?.href ?? "file:///").href;
const wrapperCode = `
if(!Map.prototype.getOrInsertComputed){
Map.prototype.getOrInsertComputed=function(k,cb){
if(this.has(k))return this.get(k);const v=cb(k);this.set(k,v);return v}}
import"${fullWorkerUrl}";`;
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([wrapperCode], { type: "text/javascript" }),
);

class PdfjsDocument implements PdfDocument {
  private pageDimsCache = new Map<number, PageDimensions>();

  constructor(private doc: pdfjsLib.PDFDocumentProxy) {}

  get pageCount(): number {
    return this.doc.numPages;
  }

  async getOutline(): Promise<OutlineEntry[]> {
    const outline = await this.doc.getOutline();
    if (!outline) return [];
    return this.flattenOutline(outline);
  }

  private async flattenOutline(
    items: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getOutline"]>>,
  ): Promise<OutlineEntry[]> {
    if (!items) return [];
    const entries: OutlineEntry[] = [];
    for (const item of items) {
      let page = 0;
      if (item.dest) {
        try {
          const dest =
            typeof item.dest === "string" ? await this.doc.getDestination(item.dest) : item.dest;
          if (dest) {
            const pageIndex = await this.doc.getPageIndex(dest[0]);
            page = pageIndex + 1; // 1-based
          }
        } catch {
          // Skip entries with unresolvable destinations
        }
      }
      entries.push({ title: item.title, page });
      if (item.items?.length) {
        const children = await this.flattenOutline(item.items);
        entries.push(...children);
      }
    }
    return entries;
  }

  getPageDimensions(pageIndex: number): PageDimensions {
    const cached = this.pageDimsCache.get(pageIndex);
    if (cached) return cached;
    // Return default until async dims are loaded
    return { width: 612, height: 792 }; // US Letter
  }

  async ensurePageDimensions(pageIndex: number): Promise<PageDimensions> {
    const cached = this.pageDimsCache.get(pageIndex);
    if (cached) return cached;
    const page = await this.doc.getPage(pageIndex + 1); // 1-based
    const viewport = page.getViewport({ scale: 1 });
    const dims = { width: viewport.width, height: viewport.height };
    this.pageDimsCache.set(pageIndex, dims);
    return dims;
  }

  async renderPage(pageIndex: number, scale: number, canvas: HTMLCanvasElement): Promise<void> {
    const page = await this.doc.getPage(pageIndex + 1); // 1-based
    const viewport = page.getViewport({ scale });
    const dims = { width: viewport.width / scale, height: viewport.height / scale };
    this.pageDimsCache.set(pageIndex, dims);

    canvas.width = Math.floor(viewport.width * devicePixelRatio);
    canvas.height = Math.floor(viewport.height * devicePixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  }

  async getPageText(pageIndex: number): Promise<string> {
    const page = await this.doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  }

  async searchPage(pageIndex: number, term: string): Promise<SearchMatch[]> {
    const text = await this.getPageText(pageIndex);
    const lowerText = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    if (!lowerText.includes(lowerTerm)) return [];

    // Get text items with positions for highlighting
    const page = await this.doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const matches: SearchMatch[] = [];

    // Build a text stream with position mapping
    let fullText = "";
    const charMap: { itemIdx: number; charIdx: number }[] = [];

    for (let i = 0; i < content.items.length; i++) {
      const item = content.items[i];
      if (!item || !("str" in item)) continue;
      for (let c = 0; c < item.str.length; c++) {
        charMap.push({ itemIdx: i, charIdx: c });
        fullText += item.str[c];
      }
      // Add space between items
      charMap.push({ itemIdx: i, charIdx: item.str.length });
      fullText += " ";
    }

    const lowerFull = fullText.toLowerCase();
    let searchIdx = 0;
    while (true) {
      const found = lowerFull.indexOf(lowerTerm, searchIdx);
      if (found === -1) break;
      searchIdx = found + 1;

      // Get the bounding rects for this match
      const startMap = charMap[found];
      if (!startMap) continue;

      const startItem = content.items[startMap.itemIdx];
      if (!startItem || !("transform" in startItem)) continue;

      // Transform coordinates from PDF space to viewport space
      const transform = startItem.transform as number[];
      const tx = transform[4] ?? 0;
      const ty = transform[5] ?? 0;
      const height = startItem.height;
      // Convert from PDF coordinate system (bottom-left origin) to canvas (top-left)
      const x = tx;
      const y = viewport.height - ty;
      const width = startItem.width * (term.length / Math.max(1, startItem.str.length));

      matches.push({
        rects: [{ x, y: y - height, width, height }],
      });
    }

    return matches;
  }

  destroy(): void {
    this.doc.destroy();
  }
}

export const pdfjsBackend: PdfBackend = {
  async loadDocument(data: Uint8Array): Promise<PdfDocument> {
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pdfjsDoc = new PdfjsDocument(doc);
    // Pre-load page dimensions for all pages
    const promises = Array.from({ length: doc.numPages }, (_, i) =>
      pdfjsDoc.ensurePageDimensions(i),
    );
    await Promise.all(promises);
    return pdfjsDoc;
  },
};
