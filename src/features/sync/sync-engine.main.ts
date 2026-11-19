import {
  type AppDataClient,
  AppDataError,
  type JsonValue,
  type RemoteEntry,
} from "./app-data-client.main";
import { jsonEqual, merge3 } from "./merge.main";
import type { SyncIssue } from "./sync.shared";

/** One kind of local data that syncs as one service document per item. */
export interface SyncSource {
  namespace: string;
  /** The user's name for an item, from whichever version is available. */
  describe(key: string, value: JsonValue | null): string;
  /** Every local item, keyed like its service document. */
  read(): Map<string, JsonValue>;
  /** Check a version from another machine; throw a readable error when it can't be used. */
  parse(key: string, value: JsonValue): JsonValue;
  /**
   * Replace the local item (`null` removes it). Throws `LocalChangedError` when the item no
   * longer equals `expected`, so a change made meanwhile is never overwritten.
   */
  apply(key: string, value: JsonValue | null, expected: JsonValue | null): Promise<void>;
}

export class LocalChangedError extends Error {
  constructor() {
    super("The item changed on this machine while it was syncing.");
    this.name = "LocalChangedError";
  }
}

/** What this machine last agreed with the service about one item. */
export interface SyncRecord {
  revision: number;
  base: JsonValue | null;
}

export interface PersistedSyncState {
  service: string;
  records: Record<string, SyncRecord>;
  lastSyncedAt?: number;
}

/** Errors about one item. Anything else, such as a rejected key, stops the whole run. */
function isItemError(error: unknown): error is AppDataError {
  return (
    error instanceof AppDataError &&
    [400, 404, 409, 413, 415].includes(error.status) &&
    error.code !== "REVISION_CONFLICT"
  );
}

const MAX_ATTEMPTS = 3;

/**
 * Local-first sync of each source with its service namespace. Local data stays the source
 * of truth: a run uploads local changes, applies other machines' changes, merges edits to
 * different properties and leaves edits to the same property as conflicts for the user.
 */
export class SyncEngine {
  private readonly issues = new Map<string, SyncIssue>();
  /** Local versions the service refused, so the same version isn't uploaded again each run. */
  private readonly refused = new Map<string, string>();
  /** Both versions of each conflict as the user is shown them. */
  private readonly conflicts = new Map<
    string,
    { local: JsonValue | null; remoteRevision: number; remoteValue: JsonValue | null }
  >();
  /** Set when the key may only read; local changes then stay on this machine. */
  readOnly = false;
  private stopped = false;

  constructor(
    private readonly client: AppDataClient,
    private readonly sources: SyncSource[],
    readonly state: PersistedSyncState,
    private readonly persist: (state: PersistedSyncState) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {}

  /** Disconnecting stops a run between items and keeps it from saving anything. */
  stop() {
    this.stopped = true;
  }

  getIssues(): SyncIssue[] {
    return [...this.issues.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  async run(): Promise<void> {
    this.readOnly = false;
    try {
      for (const source of this.sources) {
        if (this.stopped) return;
        const remote = new Map((await this.client.list(source.namespace)).map((e) => [e.key, e]));
        const local = source.read();
        const prefix = `${source.namespace}/`;
        const keys = new Set([
          ...local.keys(),
          ...remote.keys(),
          ...Object.keys(this.state.records)
            .filter((id) => id.startsWith(prefix))
            .map((id) => id.slice(prefix.length)),
        ]);
        for (const key of keys) {
          if (this.stopped) return;
          await this.reconcile(source, key, local.get(key) ?? null, remote.get(key) ?? null);
        }
      }
      this.state.lastSyncedAt = this.now();
    } finally {
      if (!this.stopped) await this.persist(this.state);
    }
  }

  /**
   * Settle a conflict by keeping one machine's version everywhere. Refuses when either
   * version changed since the conflict was found, so the user never picks one they haven't seen.
   */
  async resolve(id: string, keep: "this-machine" | "other-machine"): Promise<void> {
    const seen = this.conflicts.get(id);
    if (!seen) throw new Error("This conflict was already resolved.");
    const { source, key } = this.locate(id);
    const changed = () => new Error("It changed again while you were choosing. Review it again.");
    const remote = await this.client.get(source.namespace, key);
    if ((remote?.revision ?? 0) !== seen.remoteRevision) throw changed();
    const local = source.read().get(key) ?? null;
    if (!jsonEqual(local, seen.local)) throw changed();
    try {
      if (keep === "other-machine") {
        await source.apply(key, seen.remoteValue, local);
        this.record(id, seen.remoteRevision, seen.remoteValue);
      } else if (local !== null) {
        const entry = await this.client.put(source.namespace, key, local, seen.remoteRevision);
        this.record(id, entry.revision, local);
      } else if (seen.remoteValue !== null) {
        const entry = await this.client.remove(source.namespace, key, seen.remoteRevision);
        this.record(id, entry.revision, null);
      } else this.record(id, seen.remoteRevision, null);
    } catch (error) {
      if (error instanceof LocalChangedError || isConflict(error)) throw changed();
      throw error;
    } finally {
      if (!this.stopped) await this.persist(this.state);
    }
    this.clear(id);
  }

  private locate(id: string): { source: SyncSource; key: string } {
    const slash = id.indexOf("/");
    const source = this.sources.find((s) => s.namespace === id.slice(0, slash));
    if (!source || slash < 0) throw new Error("Unknown sync item.");
    return { source, key: id.slice(slash + 1) };
  }

  private async reconcile(
    source: SyncSource,
    key: string,
    local: JsonValue | null,
    remote: RemoteEntry | null,
    attempt = 1,
  ): Promise<void> {
    const id = `${source.namespace}/${key}`;
    const record = this.state.records[id];
    const base = record?.base ?? null;
    const remoteRevision = remote?.revision ?? 0;
    let remoteValue: JsonValue | null = null;
    if (remote?.value != null) {
      try {
        remoteValue = source.parse(key, remote.value);
      } catch (error) {
        this.issue(id, source.describe(key, local ?? base), "not-applied", message(error));
        return;
      }
    }
    const label = source.describe(key, local ?? remoteValue ?? base);
    const remoteChanged = remoteRevision !== (record?.revision ?? 0);
    const localChanged = !jsonEqual(local, base);

    if (!remoteChanged && !localChanged) {
      this.clear(id);
      if (remoteRevision === 0 && base === null) delete this.state.records[id];
      return;
    }
    if (!localChanged) return this.download(source, key, remoteRevision, remoteValue, local);
    if (!remoteChanged || (remoteValue === null && base === null))
      // Changed only here, or created here while this machine had never seen the remote
      // version, which another machine had since removed.
      return this.upload(source, key, local, remote, label, attempt);
    if (jsonEqual(local, remoteValue)) {
      this.record(id, remoteRevision, remoteValue);
      this.clear(id);
      return;
    }
    if (local !== null && remoteValue !== null) {
      const result = merge3(base ?? undefined, local, remoteValue);
      if (result.merged) {
        const merged = result.value as JsonValue;
        if (!jsonEqual(merged, local)) {
          try {
            await source.apply(key, merged, local);
          } catch (error) {
            if (!(error instanceof LocalChangedError))
              this.issue(id, label, "not-applied", message(error));
            return;
          }
        }
        this.record(id, remoteRevision, remoteValue);
        if (jsonEqual(merged, remoteValue)) this.clear(id);
        else await this.upload(source, key, merged, remote, label, attempt);
        return;
      }
    }
    this.conflicts.set(id, { local, remoteRevision, remoteValue });
    this.issue(
      id,
      label,
      "conflict",
      local === null
        ? "Removed on this machine and changed on another."
        : remoteValue === null
          ? "Changed on this machine and removed on another."
          : "Changed on this machine and on another.",
    );
  }

  private async download(
    source: SyncSource,
    key: string,
    revision: number,
    value: JsonValue | null,
    expected: JsonValue | null,
  ): Promise<void> {
    const id = `${source.namespace}/${key}`;
    try {
      if (!jsonEqual(value, expected)) await source.apply(key, value, expected);
    } catch (error) {
      // A change made here meanwhile is reconciled on the next run.
      if (!(error instanceof LocalChangedError))
        this.issue(id, source.describe(key, value ?? expected), "not-applied", message(error));
      return;
    }
    this.record(id, revision, value);
    this.clear(id);
  }

  private async upload(
    source: SyncSource,
    key: string,
    value: JsonValue | null,
    remote: RemoteEntry | null,
    label: string,
    attempt: number,
  ): Promise<void> {
    const id = `${source.namespace}/${key}`;
    const revision = remote?.revision ?? 0;
    if (value === null && (remote === null || remote.deleted)) {
      this.record(id, revision, null);
      if (revision === 0) delete this.state.records[id];
      this.clear(id);
      return;
    }
    if (this.readOnly) return;
    const fingerprint = JSON.stringify(value);
    if (this.refused.get(id) === fingerprint) return;
    try {
      const entry =
        value === null
          ? await this.client.remove(source.namespace, key, revision)
          : await this.client.put(source.namespace, key, value, revision);
      this.record(id, entry.revision, value);
      this.refused.delete(id);
      this.clear(id);
    } catch (error) {
      if (isConflict(error) && attempt < MAX_ATTEMPTS) {
        // Another machine wrote first: reconcile with its version.
        const fresh = await this.client.get(source.namespace, key);
        const local = source.read().get(key) ?? null;
        return this.reconcile(source, key, local, fresh, attempt + 1);
      }
      if (error instanceof AppDataError && error.code === "READ_ONLY") {
        this.readOnly = true;
        return;
      }
      if (!isItemError(error)) throw error;
      this.refused.set(id, fingerprint);
      this.issue(
        id,
        label,
        error.status === 413 ? "too-large" : "not-uploaded",
        error.status === 413
          ? `Too large to sync. The service says: “${error.message}” It stays on this machine.`
          : `The service refused it: “${error.message}” It stays on this machine.`,
      );
    }
  }

  private record(id: string, revision: number, base: JsonValue | null) {
    this.state.records[id] = { revision, base };
  }

  private issue(id: string, label: string, kind: SyncIssue["kind"], text: string) {
    if (kind !== "conflict") this.conflicts.delete(id);
    this.issues.set(id, { id, label, kind, message: text });
  }

  private clear(id: string) {
    this.issues.delete(id);
    this.refused.delete(id);
    this.conflicts.delete(id);
  }
}

function isConflict(error: unknown): boolean {
  return error instanceof AppDataError && error.code === "REVISION_CONFLICT";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
