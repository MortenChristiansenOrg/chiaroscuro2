export interface DataStore {
  // Collection management
  collection<T>(name: string): Collection<T>;

  // Settings (JSON file-backed)
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}

export interface Collection<T> {
  findOne(id: string): Promise<T | undefined>;
  findMany(query: Query<T>): Promise<T[]>;
  insert(doc: T): Promise<T>;
  upsert(doc: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  observe(query: Query<T>): Observable<T[]>;
}

export interface Query<T> {
  selector?: Partial<Record<keyof T, unknown>>;
  sort?: Array<{ field: keyof T; direction: "asc" | "desc" }>;
  limit?: number;
}

export interface Observable<T> {
  subscribe(callback: (value: T) => void): Unsubscribe;
}

export type Unsubscribe = () => void;
