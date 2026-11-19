import { randomUUID } from "node:crypto";
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

/** Present while settings that couldn't be read at startup haven't been dealt with. */
const UNREADABLE_MARKER = "settings.unreadable";

export class JsonDataStore implements DataStore {
  private collections = new Map<string, JsonCollection<unknown>>();
  private settings: Record<string, unknown> = {};
  private settingsPath: string;
  private dirty = false;
  /** Set when an unreadable settings file couldn't be moved aside; saving would destroy it. */
  private frozen = false;

  constructor(private dataDir: string) {
    this.settingsPath = path.join(dataDir, "settings.json");
  }

  async initialize(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.settingsPath)) return;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.settingsPath, "utf-8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        throw new Error("Settings must be a JSON object.");
      this.settings = parsed as Record<string, unknown>;
    } catch (error) {
      console.error("Failed to read settings; starting with defaults:", error);
      this.settings = {};
      // Record the loss before anything else, so it's still known after a crash or restart
      // until whoever depends on it (sync) has dealt with it.
      fs.writeFileSync(path.join(this.dataDir, UNREADABLE_MARKER), new Date().toISOString());
      // Keep the unreadable file for recovery instead of overwriting it with the next save.
      try {
        fs.renameSync(
          this.settingsPath,
          `${this.settingsPath}.unreadable-${Date.now()}-${randomUUID().slice(0, 8)}`,
        );
      } catch (renameError) {
        console.error(
          "Failed to keep the unreadable settings file; not saving settings:",
          renameError,
        );
        this.frozen = true;
      }
    }
  }

  async destroy(): Promise<void> {
    // Synchronous final flush of all collections
    for (const col of this.collections.values()) {
      col.flush();
    }
    if (this.dirty) {
      try {
        this.write(this.settings);
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

  settingsUnreadable(): boolean {
    return fs.existsSync(path.join(this.dataDir, UNREADABLE_MARKER));
  }

  acknowledgeSettingsUnreadable(): void {
    fs.rmSync(path.join(this.dataDir, UNREADABLE_MARKER), { force: true });
  }

  /**
   * Write a complete copy, flush it to disk and swap it in, so neither a failure nor a crash
   * leaves a partly written file.
   */
  private write(settings: Record<string, unknown>) {
    if (this.frozen) throw new Error("Settings aren't saved while an unreadable copy is kept.");
    const temp = `${this.settingsPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      const fd = fs.openSync(temp, "w");
      try {
        fs.writeFileSync(fd, JSON.stringify(settings, null, 2));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, this.settingsPath);
    } catch (error) {
      fs.rmSync(temp, { force: true });
      throw error;
    }
  }

  async setSetting<T>(key: string, value: T, options?: { durable?: boolean }): Promise<void> {
    await this.setSettings({ [key]: value }, options);
  }

  async setSettings(
    values: Record<string, unknown>,
    options?: { durable?: boolean },
  ): Promise<void> {
    if (options?.durable) {
      const next = { ...this.settings, ...values };
      this.write(next);
      this.settings = next;
      this.dirty = false;
      return;
    }
    Object.assign(this.settings, values);
    this.dirty = true;
    try {
      this.write(this.settings);
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
