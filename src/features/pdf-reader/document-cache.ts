import { logError } from "../../shared/log";
import type { PdfDocument } from "./backends/types";

export interface CachedPdf {
  document: PdfDocument;
  pdfKey: string;
  savedZoom: number;
}

interface Entry {
  value: Promise<CachedPdf>;
  users: number;
}

/** Retain only a few inactive documents; mounted readers always own a lease. */
export class PdfDocumentCache {
  private entries = new Map<string, Entry>();

  constructor(private readonly maxInactive = 3) {}

  acquire(url: string, load: () => Promise<CachedPdf>) {
    let entry = this.entries.get(url);
    if (!entry) {
      const value = Promise.resolve().then(load);
      entry = { value, users: 0 };
      const created = entry;
      // Failed loads must not poison later attempts.
      void value.catch(() => {
        if (this.entries.get(url) === created) this.entries.delete(url);
      });
    }
    const owned = entry;
    owned.users++;
    this.entries.delete(url);
    this.entries.set(url, owned);
    let released = false;
    return {
      value: owned.value,
      release: () => {
        if (released) return;
        released = true;
        owned.users--;
        if (owned.users === 0 && this.entries.get(url) !== owned) {
          this.destroy(owned);
        } else {
          this.trim();
        }
      },
    };
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.users === 0) this.destroy(entry);
    }
    // Active entries are released by their last owner, including pending loads.
    this.entries.clear();
  }

  private trim(): void {
    let inactive = [...this.entries.values()].filter((entry) => entry.users === 0).length;
    for (const [url, entry] of this.entries) {
      if (inactive <= this.maxInactive) break;
      if (entry.users !== 0) continue;
      this.entries.delete(url);
      this.destroy(entry);
      inactive--;
    }
  }

  private destroy(entry: Entry): void {
    void entry.value
      .then(
        (pdf) => pdf.document.destroy(),
        () => {},
      )
      .catch(logError("pdf-reader", "release cached document"));
  }
}

export const documentCache = new PdfDocumentCache();
