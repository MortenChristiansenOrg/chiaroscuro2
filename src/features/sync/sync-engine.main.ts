import { createHash, randomUUID } from "node:crypto";
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
  /** Every local item, keyed like its service document. Throws when local data can't be read. */
  read(): Map<string, JsonValue>;
  /**
   * Check a version from another machine; throw a readable error when it can't be used.
   * `previous` is the last version this machine synced, even if it was since removed.
   */
  parse(key: string, value: JsonValue, previous: JsonValue | null): JsonValue;
  /**
   * Replace the local item (`null` removes it) and save it durably, or throw and leave it
   * unchanged. Throws `LocalChangedError` when the item no longer equals `expected`, so a
   * change made meanwhile is never overwritten.
   */
  apply(key: string, value: JsonValue | null, expected: JsonValue | null): Promise<void>;
}

export class LocalChangedError extends Error {
  constructor() {
    super("The item changed on this machine while it was syncing.");
    this.name = "LocalChangedError";
  }
}

class StoppedError extends Error {
  constructor() {
    super("Sync was disconnected.");
    this.name = "StoppedError";
  }
}

/** What this machine last agreed with the service about one item. */
export interface SyncRecord {
  revision: number;
  base: JsonValue | null;
  /** Fingerprint of the service's document at `revision`, exactly as the service sent it. */
  remote: string;
  /** The last version before a removal, so a recreated item keeps its identity. */
  known?: JsonValue;
}

export interface PersistedSyncState {
  /** Which service and key this history belongs to. */
  service: string;
  records: Record<string, SyncRecord>;
  lastSyncedAt?: number;
  /** Learned from the service refusing a write; keys can't gain write access later. */
  readOnly?: boolean;
  /** The service's history marker this history belongs to (see `checkHistory`). */
  marker?: string;
}

/** Errors about one item. Anything else, such as a rejected key, stops the whole run. */
function isItemError(error: unknown): error is AppDataError {
  return (
    error instanceof AppDataError &&
    [400, 404, 409, 413, 415].includes(error.status) &&
    error.code !== "REVISION_CONFLICT"
  );
}

function isConflict(error: unknown): boolean {
  return error instanceof AppDataError && error.code === "REVISION_CONFLICT";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

/** Identifies a service document version as sent, before any parsing. */
function remoteFingerprint(entry: RemoteEntry | null): string {
  return fingerprint(entry ? [entry.deleted, entry.deleted ? null : entry.value] : null);
}

function readMarker(entry: RemoteEntry | null): string | undefined {
  const id =
    entry && !entry.deleted && typeof entry.value === "object" && entry.value !== null
      ? (entry.value as { id?: unknown }).id
      : undefined;
  return typeof id === "string" ? id : undefined;
}

/**
 * A document only this browser writes, holding a random id. A service that lost its data
 * (reset, restored, or another account behind the address) no longer has the id this
 * machine remembers, so its history no longer applies.
 */
const MARKER = { namespace: "meta", key: "history" } as const;

const MAX_ATTEMPTS = 3;

interface Conflict {
  local: JsonValue | null;
  remoteRevision: number;
  remoteValue: JsonValue | null;
  remote: string;
  version: string;
}

/**
 * Local-first sync of each source with its service namespace. Local data stays the source
 * of truth: a run uploads local changes, applies other machines' changes, merges edits to
 * different properties and leaves edits to the same property as conflicts for the user.
 * Callers run one `run` or `resolve` at a time.
 */
export class SyncEngine {
  private readonly issues = new Map<string, SyncIssue>();
  /** Local versions the service refused, so the same version isn't uploaded again each run. */
  private readonly refused = new Map<string, string>();
  /** Both versions of each conflict as the user is shown them. */
  private readonly conflicts = new Map<string, Conflict>();
  private stopped = false;
  /** Whether history changed since it was last saved. */
  private dirty = false;

  constructor(
    private readonly client: AppDataClient,
    private readonly sources: SyncSource[],
    readonly state: PersistedSyncState,
    private readonly persist: (state: PersistedSyncState) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {}

  /** True once the key turned out to be read-only; local changes then stay on this machine. */
  get readOnly(): boolean {
    return this.state.readOnly === true;
  }

  /** Whether any local item differs from what was last synced, without asking the service. */
  hasLocalChanges(): boolean {
    for (const source of this.sources) {
      const local = source.read();
      const prefix = `${source.namespace}/`;
      for (const [key, value] of local)
        if (!jsonEqual(value, this.state.records[prefix + key]?.base ?? null)) return true;
      for (const id of Object.keys(this.state.records))
        if (
          id.startsWith(prefix) &&
          this.state.records[id]?.base !== null &&
          !local.has(id.slice(prefix.length))
        )
          return true;
    }
    return false;
  }

  /** Disconnecting stops a run at its next step; nothing changes or saves after that. */
  stop() {
    this.stopped = true;
  }

  getIssues(): SyncIssue[] {
    return [...this.issues.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  private guard() {
    if (this.stopped) throw new StoppedError();
  }

  async run(): Promise<void> {
    try {
      await this.checkHistory();
      for (const source of this.sources) {
        this.guard();
        const remote = new Map((await this.client.list(source.namespace)).map((e) => [e.key, e]));
        this.guard();
        const local = source.read();
        const prefix = `${source.namespace}/`;
        const keys = new Set([
          ...local.keys(),
          ...remote.keys(),
          // Items with a history, and items with an issue but no history (refused uploads
          // of items that only ever existed here), so their state stays current.
          ...[...Object.keys(this.state.records), ...this.issues.keys()]
            .filter((id) => id.startsWith(prefix))
            .map((id) => id.slice(prefix.length)),
        ]);
        for (const key of keys)
          await this.reconcile(source, key, local.get(key) ?? null, remote.get(key) ?? null);
      }
      this.state.lastSyncedAt = this.now();
    } catch (error) {
      if (!(error instanceof StoppedError)) throw error;
    } finally {
      // An idle run only moves the last-synced time, which isn't worth a disk write.
      await this.save();
    }
  }

  /** Save history if it changed; a failed save is retried after the next run. */
  private async save() {
    if (this.stopped || !this.dirty) return;
    await this.persist(this.state);
    this.dirty = false;
  }

  /**
   * Forget all history when the service's marker isn't the one this machine remembers, or
   * can't be confirmed. Returns the current marker, if any.
   */
  private async checkHistory(): Promise<string | undefined> {
    this.guard();
    const entry = await this.client.get(MARKER.namespace, MARKER.key);
    this.guard();
    let marker = readMarker(entry);
    if (marker === undefined) {
      // A missing marker means the service lost its data. Whatever happens next, history
      // from before can't be trusted, even if this machine can't create a new marker.
      this.forgetAll();
      if (this.readOnly) return undefined;
      const fresh = randomUUID();
      try {
        await this.client.put(MARKER.namespace, MARKER.key, { id: fresh }, entry?.revision ?? 0);
        marker = fresh;
      } catch (error) {
        if (error instanceof AppDataError && error.code === "READ_ONLY") {
          this.state.readOnly = true;
          this.dirty = true;
          return undefined;
        }
        // A service that refuses the marker still syncs, without history to trust.
        if (isItemError(error)) return undefined;
        if (!isConflict(error)) throw error;
        // Another machine created it first.
        marker = readMarker(await this.client.get(MARKER.namespace, MARKER.key));
        if (marker === undefined) throw error;
      }
      this.guard();
    }
    if (marker !== this.state.marker) {
      this.forgetAll();
      this.state.marker = marker;
      this.dirty = true;
    }
    return marker;
  }

  /** First-sync rules apply to every item from here: nothing is removed anywhere. */
  private forgetAll() {
    if (this.state.marker === undefined && !Object.keys(this.state.records).length) return;
    this.state.records = {};
    this.state.marker = undefined;
    this.issues.clear();
    this.refused.clear();
    this.conflicts.clear();
    this.dirty = true;
  }

  /**
   * Settle a conflict by keeping one machine's version everywhere. `version` identifies the
   * conflict the user saw; the choice is refused if either version changed since then.
   */
  async resolve(
    id: string,
    keep: "this-machine" | "other-machine",
    version: string,
  ): Promise<void> {
    const seen = this.conflicts.get(id);
    if (!seen) throw new Error("This conflict was already resolved.");
    const changed = () => new Error("It changed again while you were choosing. Review it again.");
    if (seen.version !== version) throw changed();
    const { source, key } = this.locate(id);
    // A service reset since the conflict was shown makes both versions meaningless.
    const marker = readMarker(await this.client.get(MARKER.namespace, MARKER.key));
    this.guard();
    if (marker !== this.state.marker) throw changed();
    const remote = await this.client.get(source.namespace, key);
    this.guard();
    if (
      (remote?.revision ?? 0) !== seen.remoteRevision ||
      remoteFingerprint(remote) !== seen.remote
    )
      throw changed();
    const local = source.read().get(key) ?? null;
    if (!jsonEqual(local, seen.local)) throw changed();
    try {
      if (keep === "other-machine") {
        await source.apply(key, seen.remoteValue, local);
        this.record(id, seen.remoteRevision, seen.remoteValue, seen.remote);
      } else if (local !== null) {
        const entry = await this.client.put(source.namespace, key, local, seen.remoteRevision);
        this.record(id, entry.revision, local, remoteFingerprint(entry));
      } else if (seen.remoteValue !== null) {
        const entry = await this.client.remove(source.namespace, key, seen.remoteRevision);
        this.record(id, entry.revision, null, remoteFingerprint(entry));
      } else this.record(id, seen.remoteRevision, null, seen.remote);
    } catch (error) {
      if (error instanceof LocalChangedError || isConflict(error)) throw changed();
      throw error;
    } finally {
      await this.save();
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
    this.guard();
    const id = `${source.namespace}/${key}`;
    let record: SyncRecord | undefined = this.state.records[id];
    const previous = record?.base ?? record?.known ?? null;
    let remoteValue: JsonValue | null = null;
    if (remote && !remote.deleted) {
      try {
        // A live document holding JSON null is invalid, not a removal.
        remoteValue = source.parse(key, remote.value as JsonValue, previous);
      } catch (error) {
        this.issue(id, source.describe(key, local ?? previous), "not-applied", message(error));
        return;
      }
    }
    const remoteRaw = remoteFingerprint(remote);
    // The service never forgets a document, lowers its revision or changes it without a new
    // revision. If that seems to happen (a restored backup, another account behind the same
    // address), what this machine remembers no longer applies: treat the item like a first
    // sync, which never removes anything.
    if (
      record &&
      record.revision > 0 &&
      (remote === null ||
        remote.revision < record.revision ||
        (remote.revision === record.revision && remoteRaw !== record.remote))
    ) {
      this.forget(id);
      record = undefined;
    }
    const base = record?.base ?? null;
    const remoteRevision = remote?.revision ?? 0;
    const label = source.describe(key, local ?? remoteValue ?? base);
    const remoteChanged = remoteRevision !== (record?.revision ?? 0);
    const localChanged = !jsonEqual(local, base);

    if (!remoteChanged && !localChanged) {
      this.clear(id);
      if (remoteRevision === 0 && base === null) this.forget(id);
      return;
    }
    if (!localChanged)
      return this.download(source, key, remoteRevision, remoteValue, remoteRaw, local);
    // Changed only here, or new here and never on the service.
    if (!remoteChanged || remote === null)
      return this.upload(source, key, local, remote, label, attempt);
    if (jsonEqual(local, remoteValue)) {
      this.record(id, remoteRevision, remoteValue, remoteRaw);
      this.clear(id);
      return;
    }
    if (local !== null && remoteValue !== null) {
      const result = merge3(base ?? undefined, local, remoteValue);
      if (result.merged) {
        const merged = result.value as JsonValue;
        if (!jsonEqual(merged, local)) {
          try {
            this.guard();
            await source.apply(key, merged, local);
          } catch (error) {
            if (error instanceof StoppedError) throw error;
            if (!(error instanceof LocalChangedError))
              this.issue(id, label, "not-applied", message(error));
            return;
          }
        }
        this.record(id, remoteRevision, remoteValue, remoteRaw);
        if (jsonEqual(merged, remoteValue)) this.clear(id);
        else await this.upload(source, key, merged, remote, label, attempt);
        return;
      }
    }
    // Names both versions as shown, and this connection's history, so a choice can't apply
    // to anything else.
    const version = fingerprint([this.state.marker, remoteRevision, remoteRaw, local]);
    this.conflicts.set(id, { local, remoteRevision, remoteValue, remote: remoteRaw, version });
    this.issue(
      id,
      label,
      "conflict",
      local === null
        ? "Removed on this machine and changed on another."
        : remoteValue === null
          ? base === null
            ? // Never synced here: it may be an old copy of something removed on purpose.
              "Still on this machine, but removed on another."
            : "Changed on this machine and removed on another."
          : "Changed on this machine and on another.",
      version,
    );
  }

  private async download(
    source: SyncSource,
    key: string,
    revision: number,
    value: JsonValue | null,
    raw: string,
    expected: JsonValue | null,
  ): Promise<void> {
    const id = `${source.namespace}/${key}`;
    try {
      this.guard();
      if (!jsonEqual(value, expected)) await source.apply(key, value, expected);
    } catch (error) {
      if (error instanceof StoppedError) throw error;
      // A change made here meanwhile is reconciled on the next run.
      if (!(error instanceof LocalChangedError))
        this.issue(id, source.describe(key, value ?? expected), "not-applied", message(error));
      return;
    }
    this.record(id, revision, value, raw);
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
      this.record(id, revision, null, remoteFingerprint(remote));
      if (revision === 0) this.forget(id);
      this.clear(id);
      return;
    }
    if (this.readOnly) return;
    const sent = JSON.stringify(value);
    if (this.refused.get(id) === sent) return;
    try {
      this.guard();
      const entry =
        value === null
          ? await this.client.remove(source.namespace, key, revision)
          : await this.client.put(source.namespace, key, value, revision);
      this.record(id, entry.revision, value, remoteFingerprint(entry));
      this.clear(id);
    } catch (error) {
      if (error instanceof StoppedError) throw error;
      if (isConflict(error)) {
        // Another machine wrote first: reconcile with its version. An item that keeps
        // changing waits for the next run instead of holding up the others.
        if (attempt >= MAX_ATTEMPTS) return;
        this.guard();
        const fresh = await this.client.get(source.namespace, key);
        this.guard();
        const local = source.read().get(key) ?? null;
        return this.reconcile(source, key, local, fresh, attempt + 1);
      }
      if (error instanceof AppDataError && error.code === "READ_ONLY") {
        this.state.readOnly = true;
        this.dirty = true;
        return;
      }
      if (!isItemError(error)) throw error;
      this.refused.set(id, sent);
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

  private record(id: string, revision: number, base: JsonValue | null, remote: string) {
    this.guard();
    const current = this.state.records[id];
    if (
      current?.revision === revision &&
      current.remote === remote &&
      jsonEqual(current.base, base)
    )
      return;
    const known = base === null ? (current?.base ?? current?.known) : undefined;
    this.state.records[id] = { revision, base, remote, ...(known != null ? { known } : {}) };
    this.dirty = true;
  }

  private forget(id: string) {
    if (!(id in this.state.records)) return;
    delete this.state.records[id];
    this.dirty = true;
  }

  private issue(
    id: string,
    label: string,
    kind: SyncIssue["kind"],
    text: string,
    version?: string,
  ) {
    if (kind !== "conflict") this.conflicts.delete(id);
    if (kind !== "too-large" && kind !== "not-uploaded") this.refused.delete(id);
    this.issues.set(id, { id, label, kind, message: text, ...(version ? { version } : {}) });
  }

  private clear(id: string) {
    this.issues.delete(id);
    this.refused.delete(id);
    this.conflicts.delete(id);
  }
}
