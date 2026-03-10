import { logError } from "./log";

/** Minimal collection interface (avoids importing from data/ which breaks web tsconfig). */
interface Collection<T> {
  findMany(query: {
    selector?: Partial<Record<string, unknown>>;
    sort?: Array<{ field: keyof T; direction: "asc" | "desc" }>;
    limit?: number;
  }): Promise<T[]>;
  upsert(doc: T): Promise<T>;
  remove(id: string): Promise<void>;
}

/**
 * In-memory Map backed by a DataStore Collection.
 * Writes auto-persist via upsert(); deletes auto-remove.
 * Errors are logged, not thrown, to match fire-and-forget persistence patterns.
 */
export class PersistedMap<K extends string, V, P extends { id: string }> {
  private map = new Map<K, V>();

  constructor(
    private collection: Collection<P>,
    private opts: {
      serialize: (key: K, value: V) => P;
      deserialize: (persisted: P) => [K, V];
      source: string;
    },
  ) {}

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Set value and persist. */
  set(key: K, value: V): void {
    this.map.set(key, value);
    this.collection
      .upsert(this.opts.serialize(key, value))
      .catch(logError(this.opts.source, "upsert"));
  }

  /** Delete value and remove from persistence. */
  delete(key: K): boolean {
    const existed = this.map.delete(key);
    if (existed) {
      this.collection.remove(key).catch(logError(this.opts.source, "remove"));
    }
    return existed;
  }

  /** Update in-memory only (no persistence). Use for transient field updates. */
  setLocal(key: K, value: V): void {
    this.map.set(key, value);
  }

  values(): V[] {
    return [...this.map.values()];
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  /** Load all records from the collection into memory. */
  async load(query?: Parameters<Collection<P>["findMany"]>[0]): Promise<void> {
    const docs = await this.collection.findMany(query ?? {});
    for (const doc of docs) {
      const [key, value] = this.opts.deserialize(doc);
      this.map.set(key, value);
    }
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }
}
