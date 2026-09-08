import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfBackend } from "./types";

const { destroy } = vi.hoisted(() => ({ destroy: vi.fn() }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({ numPages: 0, loadingTask: { destroy } }),
  }),
}));

describe("PDF.js document cleanup", () => {
  let backend: PdfBackend;

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
    backend = (await import("./pdfjs-backend")).pdfjsBackend;
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
    const doc = await backend.loadDocument(new Uint8Array());
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
    const doc = await backend.loadDocument(new Uint8Array());
    await expect(doc.destroy()).rejects.toThrow("Worker cleanup failed");
  });
});
