import fs from "node:fs";
import path from "node:path";
import { MemoryCollection } from "./memory-store";
import type { Collection, DataStore, Query } from "./types";

const FLUSH_DELAY_MS = 100;

class JsonCollection<T> extends MemoryCollection<T> {
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private filePath: string) {
    super();

    // Load existing data from disk
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as T[];
        this._loadDocs(data);
      } catch {
        // Corrupted file, start fresh
      }
    }

    // Schedule flush on any mutation
    this.onMutate = () => this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.dirty = true;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  flush(): void {
    if (!this.dirty) return;
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this._getAllDocs()));
      this.dirty = false;
    } catch (err) {
      this.scheduleFlush();
      console.error(`Failed to flush ${this.filePath}:`, err);
    }
  }
}

export class JsonDataStore implements DataStore {
  private collections = new Map<string, JsonCollection<unknown>>();
  private settings: Record<string, unknown> = {};
  private settingsPath: string;
  private dirty = false;

  constructor(private dataDir: string) {
    this.settingsPath = path.join(dataDir, "settings.json");
  }

  async initialize(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.settingsPath)) {
      try {
        this.settings = JSON.parse(fs.readFileSync(this.settingsPath, "utf-8"));
      } catch {
        this.settings = {};
      }
    }
  }

  async destroy(): Promise<void> {
    // Synchronous final flush of all collections
    for (const col of this.collections.values()) {
      col.flush();
    }
    // Flush settings
    if (this.dirty) {
      try {
        fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
        this.dirty = false;
      } catch (err) {
        console.error("Failed to flush settings on destroy:", err);
      }
    }
  }

  collection<T>(name: string): Collection<T> {
    if (name === "settings") throw new Error(`Collection name "settings" is reserved`);
    if (!name || /[/\\]|\.\./.test(name)) {
      throw new Error(`Invalid collection name: "${name}"`);
    }
    if (!this.collections.has(name)) {
      const filePath = path.join(this.dataDir, `${name}.json`);
      this.collections.set(name, new JsonCollection<unknown>(filePath));
    }
    return this.collections.get(name) as unknown as Collection<T>;
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return this.settings[key] as T | undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    this.settings[key] = value;
    this.dirty = true;
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
      this.dirty = false;
    } catch (err) {
      // dirty remains true; destroy() will retry on shutdown
      console.error("Failed to write settings:", err);
    }
  }
}

export function createDataStore(dataDir: string): DataStore {
  return new JsonDataStore(dataDir);
}
