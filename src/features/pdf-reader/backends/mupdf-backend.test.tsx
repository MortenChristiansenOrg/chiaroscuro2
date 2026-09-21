import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPdfDocument } from "./mupdf-backend";

const { nativeDocument, page, text, pixmap } = vi.hoisted(() => {
  const text = { asText: vi.fn(), walk: vi.fn(), destroy: vi.fn() };
  const pixmap = {
    getWidth: () => 2,
    getHeight: () => 1,
    getPixels: () => new Uint8Array([255, 255, 255, 20, 40, 60]),
    destroy: vi.fn(),
  };
  const page = {
    getBounds: vi.fn(() => [0, 0, 612, 792]),
    toPixmap: vi.fn(() => pixmap),
    toStructuredText: vi.fn(() => text),
    search: vi.fn(() => []),
    destroy: vi.fn(),
  };
  const nativeDocument = {
    countPages: () => 1,
    loadPage: vi.fn(() => page),
    loadOutline: vi.fn(),
    destroy: vi.fn(),
  };
  return { nativeDocument, page, text, pixmap };
});

vi.mock("./mupdf-wasm-config", () => ({}));
vi.mock("mupdf", () => ({
  PDFDocument: class {
    countPages = nativeDocument.countPages;
    loadPage = nativeDocument.loadPage;
    loadOutline = nativeDocument.loadOutline;
    destroy = nativeDocument.destroy;
  },
  Matrix: { scale: (x: number, y: number) => [x, 0, 0, y, 0, 0] },
  ColorSpace: { DeviceRGB: "RGB" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  page.getBounds.mockReturnValue([0, 0, 612, 792]);
  text.asText.mockReturnValue("MuPDF fixture");
  vi.stubGlobal("devicePixelRatio", 2);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MuPDF adapter", () => {
  it("releases pages after dimension reads and caches dimensions", async () => {
    const doc = await loadPdfDocument(new Uint8Array());
    expect(doc.getPageDimensions(0)).toEqual({ width: 612, height: 792 });
    expect(doc.getPageDimensions(0)).toEqual({ width: 612, height: 792 });
    expect(nativeDocument.loadPage).toHaveBeenCalledOnce();
    expect(page.destroy).toHaveBeenCalledOnce();
  });

  it("renders opaque RGB pixels to canvas at display scale and releases the pixmap", async () => {
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );
    const doc = await loadPdfDocument(new Uint8Array());
    const canvas = document.createElement("canvas");
    await doc.renderPage(0, 1.25, canvas);
    expect(page.toPixmap).toHaveBeenCalledWith([2.5, 0, 0, 2.5, 0, 0], "RGB", false);
    expect(canvas.style.width).toBe("765px");
    expect(putImageData).toHaveBeenCalledWith(
      expect.objectContaining({
        data: new Uint8ClampedArray([255, 255, 255, 255, 20, 40, 60, 255]),
        width: 2,
        height: 1,
      }),
      0,
      0,
    );
    expect(pixmap.destroy).toHaveBeenCalledOnce();
    expect(page.destroy).toHaveBeenCalledOnce();
  });

  it("releases rendering resources even when canvas drawing fails", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("Canvas unavailable");
    });
    const doc = await loadPdfDocument(new Uint8Array());
    await expect(doc.renderPage(0, 1, document.createElement("canvas"))).rejects.toThrow(
      "Canvas unavailable",
    );
    expect(pixmap.destroy).toHaveBeenCalledOnce();
    expect(page.destroy).toHaveBeenCalledOnce();
  });

  it("releases extracted text and pages on success and failure", async () => {
    const doc = await loadPdfDocument(new Uint8Array());
    expect(await doc.getPageText(0)).toBe("MuPDF fixture");
    text.asText.mockImplementationOnce(() => {
      throw new Error("Extraction failed");
    });
    await expect(doc.getPageText(0)).rejects.toThrow("Extraction failed");
    expect(text.destroy).toHaveBeenCalledTimes(2);
    expect(page.destroy).toHaveBeenCalledTimes(2);
    await doc.destroy();
    expect(nativeDocument.destroy).toHaveBeenCalledOnce();
  });

  it("imports nested outline pages using the reader's one-based page numbering", async () => {
    nativeDocument.loadOutline.mockReturnValue([
      { title: "First", page: 0, down: [{ title: "Second", page: 1 }] },
      { title: "External link", page: -1 },
    ]);
    const doc = await loadPdfDocument(new Uint8Array());
    expect(await doc.getOutline()).toEqual([
      { title: "First", page: 1 },
      { title: "Second", page: 2 },
    ]);
  });
});
