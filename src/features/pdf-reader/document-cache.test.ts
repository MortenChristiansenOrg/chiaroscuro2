import { describe, expect, it, vi } from "vitest";
import type { PdfDocument } from "./backends/types";
import { type CachedPdf, PdfDocumentCache } from "./document-cache";

function pdf(): CachedPdf {
  return {
    document: { destroy: vi.fn(async () => {}) } as unknown as PdfDocument,
    pdfKey: "fixture:hash",
    savedZoom: 1,
  };
}

describe("PDF document ownership", () => {
  it("shares concurrent loads and retains only the most recently used inactive document", async () => {
    const cache = new PdfDocumentCache(1);
    const first = pdf();
    const load = vi.fn(async () => first);
    const a = cache.acquire("first", load);
    const b = cache.acquire("first", load);
    await Promise.all([a.value, b.value]);
    expect(load).toHaveBeenCalledTimes(1);
    a.release();
    const second = pdf();
    const c = cache.acquire("second", async () => second);
    await c.value;
    c.release();
    expect(first.document.destroy).not.toHaveBeenCalled();
    b.release();
    await Promise.resolve();
    expect(first.document.destroy).toHaveBeenCalledTimes(1);
    expect(second.document.destroy).not.toHaveBeenCalled();
    cache.clear();
    await Promise.resolve();
    expect(second.document.destroy).toHaveBeenCalledTimes(1);
  });

  it("protects active documents during eviction and teardown until their last owner releases", async () => {
    const cache = new PdfDocumentCache(0);
    const document = pdf();
    const a = cache.acquire("active", async () => document);
    const b = cache.acquire("active", async () => document);
    await a.value;
    cache.clear();
    a.release();
    a.release();
    await Promise.resolve();
    expect(document.document.destroy).not.toHaveBeenCalled();
    b.release();
    await Promise.resolve();
    expect(document.document.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys a late load after its reader has gone away", async () => {
    const cache = new PdfDocumentCache(0);
    const document = pdf();
    const pending = Promise.withResolvers<CachedPdf>();
    const lease = cache.acquire("pending", () => pending.promise);
    lease.release();
    cache.clear();
    pending.resolve(document);
    await lease.value;
    expect(document.document.destroy).toHaveBeenCalledTimes(1);
  });

  it("allows retries after a failed load without destroying a replacement entry", async () => {
    const cache = new PdfDocumentCache(0);
    const failed = cache.acquire("retry", async () => {
      throw new Error("offline");
    });
    await expect(failed.value).rejects.toThrow("offline");
    const document = pdf();
    const retry = cache.acquire("retry", async () => document);
    await retry.value;
    failed.release();
    expect(document.document.destroy).not.toHaveBeenCalled();
    retry.release();
    await Promise.resolve();
    expect(document.document.destroy).toHaveBeenCalledTimes(1);
  });
});
