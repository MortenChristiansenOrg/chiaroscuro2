import type { Collection, DataStore, Observable, Query, Unsubscribe } from "./types";

function evaluateQuery<T>(docs: Iterable<T>, query: Query<T>): T[] {
  let results = [...docs];

  if (query.selector) {
    const entries = Object.entries(query.selector);
    results = results.filter((doc) => {
      for (const [key, value] of entries) {
        if ((doc as Record<string, unknown>)[key] !== value) return false;
      }
      return true;
    });
  }

  if (query.sort) {
    results.sort((a, b) => {
      for (const { field, direction } of query.sort as NonNullable<typeof query.sort>) {
        const av = (a as Record<string, unknown>)[field as string];
        const bv = (b as Record<string, unknown>)[field as string];
        if ((av as string) < (bv as string)) return direction === "asc" ? -1 : 1;
        if ((av as string) > (bv as string)) return direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  if (query.limit !== undefined) {
    results = results.slice(0, query.limit);
  }

  return results;
}

class MemoryCollection<T> implements Collection<T> {
  private docs = new Map<string, T>();
  private observers = new Set<{
    query: Query<T>;
    callback: (value: T[]) => void;
  }>();
  protected onMutate?: () => void;

  async findOne(id: string): Promise<T | undefined> {
    return this.docs.get(id);
  }

  async findMany(query: Query<T>): Promise<T[]> {
    return evaluateQuery(this.docs.values(), query);
  }

  async insert(doc: T): Promise<T> {
    const id = (doc as Record<string, unknown>).id as string;
    if (!id) throw new Error("Document must have an id field");
    const copy = { ...doc };
    this.docs.set(id, copy);
    this.notifyObservers();
    this.onMutate?.();
    return copy;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`Document "${id}" not found`);
    const updated = { ...existing, ...patch, id } as T;
    this.docs.set(id, updated);
    this.notifyObservers();
    this.onMutate?.();
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.docs.delete(id);
    this.notifyObservers();
    this.onMutate?.();
  }

  observe(query: Query<T>): Observable<T[]> {
    return {
      subscribe: (callback: (value: T[]) => void): Unsubscribe => {
        const observer = { query, callback };
        this.observers.add(observer);
        callback(evaluateQuery(this.docs.values(), query));
        return () => {
          this.observers.delete(observer);
        };
      },
    };
  }

  /** Bulk-load docs without triggering observers (used by persistent store on init). */
  _loadDocs(docs: T[]): void {
    for (const doc of docs) {
      const id = (doc as Record<string, unknown>).id as string;
      if (id) this.docs.set(id, doc);
    }
  }

  /** Serialize all docs for persistence. */
  _getAllDocs(): T[] {
    return [...this.docs.values()];
  }

  private notifyObservers(): void {
    for (const { query, callback } of this.observers) {
      callback(evaluateQuery(this.docs.values(), query));
    }
  }
}

export { MemoryCollection, evaluateQuery };

export class MemoryDataStore implements DataStore {
  private collections = new Map<string, MemoryCollection<unknown>>();
  private settings = new Map<string, unknown>();

  collection<T>(name: string): Collection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection<unknown>());
    }
    return this.collections.get(name) as unknown as Collection<T>;
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return this.settings.get(key) as T | undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    this.settings.set(key, value);
  }

  async initialize(): Promise<void> {
    // No-op
  }

  async destroy(): Promise<void> {
    this.collections.clear();
    this.settings.clear();
  }
}
