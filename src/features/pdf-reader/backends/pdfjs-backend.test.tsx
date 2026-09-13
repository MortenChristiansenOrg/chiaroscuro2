import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfDocument } from "./types";

const { destroy } = vi.hoisted(() => ({ destroy: vi.fn() }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({ numPages: 0, loadingTask: { destroy } }),
  }),
}));

describe("PDF.js document cleanup", () => {
  let loadDocument: (data: Uint8Array) => Promise<PdfDocument>;

  beforeAll(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL() {
          return "blob:pdf-worker-test";
        }
      },
    );
    loadDocument = (await import("./pdfjs-backend")).loadPdfDocument;
  });

  beforeEach(() => {
    destroy.mockReset();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for the worker to finish cleanup", async () => {
    const cleanup = Promise.withResolvers<void>();
    destroy.mockReturnValue(cleanup.promise);
    const doc = await loadDocument(new Uint8Array());
    const completed = vi.fn();
    const pending = doc.destroy().then(completed);

    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    cleanup.resolve();
    await pending;
    expect(completed).toHaveBeenCalledOnce();
  });

  it("propagates cleanup failures to the caller", async () => {
    destroy.mockRejectedValue(new Error("Worker cleanup failed"));
    const doc = await loadDocument(new Uint8Array());
    await expect(doc.destroy()).rejects.toThrow("Worker cleanup failed");
  });
});
