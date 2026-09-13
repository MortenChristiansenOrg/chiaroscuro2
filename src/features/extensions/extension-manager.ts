import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { DataStore } from "../../data/types";
import type { LoadedExtension, Platform } from "../../platform/types";
import type { ExtensionManifest } from "./extension-package";
import {
  BITWARDEN_ID,
  compareVersions,
  downloadPackage,
  extractPackage,
  manifestSchema,
  requiredPermissions,
  verifyCRX,
} from "./extension-package";

export interface PendingExtension {
  version: string;
  permissions: string[];
  hash: string;
  approved: boolean;
}
export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed?: boolean;
  permissions?: string[];
  pending?: PendingExtension;
  lastChecked?: number;
  error?: string;
  failedVersion?: string;
}
interface Transaction {
  previous: ExtensionRecord;
  next: ExtensionRecord;
  hadCurrent: boolean;
}
const validId = /^[a-p]{32}$/;
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );
async function writeAtomic(file: string, data: string | Buffer): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, data, { mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

/** Serializes lifecycle operations. Packages are activated only at startup or first install. */
export class ExtensionManager {
  records: ExtensionRecord[] = [];
  loaded = new Map<string, LoadedExtension>();
  manifests = new Map<string, ExtensionManifest>();
  busy = new Set<string>();
  reviews = new Map<string, { token: string; permissions: string[] }>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly platform: Platform,
    private readonly store: DataStore,
    private readonly changed: () => void,
    private readonly chromeVersion: string,
    private readonly fetchPackage = downloadPackage,
    private readonly verifyPackage = verifyCRX,
  ) {}
  get root(): string {
    return path.join(this.platform.getUserDataPath(), "extensions");
  }
  directory(id: string): string {
    if (!validId.test(id)) throw new Error("Invalid extension ID");
    return path.join(this.root, id);
  }
  private pendingFile(id: string) {
    this.directory(id);
    return path.join(this.root, `.${id}.pending.crx`);
  }
  private journalFile(id: string) {
    this.directory(id);
    return path.join(this.root, `.${id}.transaction.json`);
  }
  private backup(id: string) {
    this.directory(id);
    return path.join(this.root, `.${id}.previous`);
  }
  private async persist() {
    await this.store.setSetting("extensions", this.records);
  }
  private record(id: string) {
    const record = this.records.find((record) => record.id === id);
    if (!record) throw new Error("Extension is not installed");
    return record;
  }
  private async serial<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      this.busy.add(id);
      this.changed();
      try {
        return await operation();
      } catch (error) {
        const record = this.records.find((record) => record.id === id);
        if (record) {
          record.error = error instanceof Error ? error.message : String(error);
          await this.persist().catch(() => {});
        }
        throw error;
      } finally {
        this.busy.delete(id);
        this.changed();
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async start(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    this.records = ((await this.store.getSetting<ExtensionRecord[]>("extensions")) ?? []).filter(
      (record) => validId.test(record.id),
    );
    // A journal is committed last. Any interrupted operation restores its prior package and metadata.
    for (const file of await fs.readdir(this.root)) {
      const match = /^\.([a-p]{32})\.transaction\.json$/.exec(file);
      if (match?.[1]) await this.recover(match[1]);
    }
    for (const file of await fs.readdir(this.root)) {
      if (/^\.[a-p]{32}\.previous$/.test(file) || /^\.(inspect|activate)-/.test(file))
        await fs.rm(path.join(this.root, file), { recursive: true, force: true });
    }
    for (const record of this.records) {
      try {
        if (record.pending?.approved) await this.activate(record);
        else if (record.installed !== false) await this.load(record);
      } catch (error) {
        const current = this.record(record.id);
        const failedVersion = current.pending?.version;
        current.pending = undefined;
        current.failedVersion ??= failedVersion;
        if (current.installed !== false && !this.loaded.has(current.id))
          await this.load(current).catch(() => {});
        current.error = `Could not start extension: ${error instanceof Error ? error.message : String(error)}. Check now to retry, or disable the extension.`;
      }
    }
    await this.persist();
    this.changed();
    // Do not make startup depend on the network. Disabled extensions are checked too.
    void this.checkAll();
    this.timer = setInterval(
      () => {
        void this.checkAll();
      },
      4 * 60 * 60 * 1000,
    );
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async checkAll(): Promise<void> {
    for (const record of this.records)
      if (record.id === BITWARDEN_ID && record.installed !== false)
        await this.check(record.id, false).catch(() => {});
  }
  async check(id: string, retryFailed = true): Promise<void> {
    return this.serial(id, async () => {
      if (id !== BITWARDEN_ID) throw new Error("Updates are only supported for Bitwarden");
      let record = this.records.find((record) => record.id === id);
      if (!record) {
        record = {
          id,
          name: "Bitwarden Password Manager",
          version: "",
          enabled: false,
          installed: false,
        };
        this.records.push(record);
      }
      if (retryFailed || !record.failedVersion) record.error = undefined;
      const bytes = await this.fetchPackage(
        id,
        this.chromeVersion,
        (!retryFailed ? record.failedVersion : undefined) ??
          record.pending?.version ??
          (record.installed !== false ? record.version : undefined),
      );
      record.lastChecked = Date.now();
      if (!bytes) {
        await this.persist();
        return;
      }
      const archive = this.verifyPackage(bytes, id);
      const stage = await fs.mkdtemp(path.join(this.root, ".inspect-"));
      try {
        const manifest = await extractPackage(archive, stage);
        record.lastChecked = Date.now();
        if (
          manifest.minimum_chrome_version &&
          compareVersions(manifest.minimum_chrome_version, this.chromeVersion) > 0
        )
          throw new Error(
            `Bitwarden ${manifest.version} requires a newer browser. Update Chiaroscuro and check again.`,
          );
        if (record.installed !== false && compareVersions(manifest.version, record.version) <= 0) {
          await this.persist();
          return;
        }
        if (
          !retryFailed &&
          record.failedVersion &&
          compareVersions(manifest.version, record.failedVersion) <= 0
        ) {
          await this.persist();
          return;
        }
        const hash = sha(bytes);
        if (record.pending?.hash === hash) {
          await this.persist();
          return;
        }
        const permissions = requiredPermissions(manifest);
        const approved =
          record.installed !== false &&
          permissions.every((permission) => record.permissions?.includes(permission));
        await writeAtomic(this.pendingFile(id), bytes);
        record.failedVersion = undefined;
        record.pending = { version: manifest.version, permissions, hash, approved };
        await this.persist();
      } finally {
        await fs.rm(stage, { recursive: true, force: true });
      }
    });
  }
  async approve(id: string, token: string): Promise<void> {
    return this.serial(id, async () => {
      const record = this.record(id);
      if (record.pending?.hash === token) {
        record.pending.approved = true;
        await this.persist();
        if (record.installed === false) await this.activate(record);
      } else {
        const review = this.reviews.get(id);
        if (!review || review.token !== token)
          throw new Error("Permissions changed. Review them again.");
        const previous = record.permissions;
        record.permissions = review.permissions;
        try {
          await this.persist();
        } catch (error) {
          record.permissions = previous;
          throw error;
        }
        this.reviews.delete(id);
        await this.load(record);
      }
      record.error = undefined;
      await this.persist();
    });
  }
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    return this.serial(id, async () => {
      const record = this.record(id);
      if (record.installed === false) throw new Error("Review installation first");
      const previous = record.enabled;
      record.enabled = enabled;
      try {
        await this.persist();
      } catch (error) {
        record.enabled = previous;
        throw error;
      }
      if (!enabled) this.unload(id);
      else await this.load(record);
      record.error = undefined;
      await this.persist();
    });
  }
  async uninstall(id: string): Promise<void> {
    return this.serial(id, async () => {
      this.record(id);
      const previous = this.records;
      this.records = this.records.filter((record) => record.id !== id);
      try {
        await this.persist();
      } catch (error) {
        this.records = previous;
        throw error;
      }
      this.unload(id);
      this.reviews.delete(id);
      this.manifests.delete(id);
      await fs.rm(this.directory(id), { recursive: true, force: true });
      await fs.rm(this.pendingFile(id), { force: true });
    });
  }
  private unload(id: string) {
    const loaded = this.loaded.get(id);
    if (loaded) this.platform.removeExtension(loaded.id);
    this.loaded.delete(id);
  }
  private async load(record: ExtensionRecord): Promise<void> {
    const manifest = manifestSchema.parse(
      JSON.parse(await fs.readFile(path.join(this.directory(record.id), "manifest.json"), "utf8")),
    );
    this.manifests.set(record.id, manifest);
    record.version = manifest.version;
    const permissions = requiredPermissions(manifest);
    if (!permissions.every((permission) => record.permissions?.includes(permission))) {
      this.reviews.set(record.id, {
        token: sha(Buffer.from(JSON.stringify(permissions))),
        permissions,
      });
      return;
    }
    this.reviews.delete(record.id);
    if (record.enabled && !this.loaded.has(record.id))
      this.loaded.set(record.id, await this.platform.loadExtension(this.directory(record.id)));
  }
  private async activate(record: ExtensionRecord): Promise<void> {
    const pending = record.pending;
    if (!pending?.approved) throw new Error("Installation requires permission approval");
    const bytes = await fs.readFile(this.pendingFile(record.id));
    if (sha(bytes) !== pending.hash)
      throw new Error("Staged package changed. Check for updates again.");
    const archive = this.verifyPackage(bytes, record.id);
    const stage = await fs.mkdtemp(path.join(this.root, ".activate-"));
    try {
      const manifest = await extractPackage(archive, stage);
      if (
        manifest.version !== pending.version ||
        (manifest.minimum_chrome_version &&
          compareVersions(manifest.minimum_chrome_version, this.chromeVersion) > 0)
      )
        throw new Error("Staged extension is incompatible with this browser");
      // Keep the unpacked path and any existing manifest key unchanged: Chromium's storage identity depends on them.
      const currentManifest = await fs
        .readFile(path.join(this.directory(record.id), "manifest.json"), "utf8")
        .then(
          (value) => JSON.parse(value) as { key?: string },
          () => undefined,
        );
      if ((currentManifest?.key ?? "") !== (manifest.key ?? "") && record.installed !== false)
        throw new Error(
          "Extension identity changed; update cannot safely preserve your vault. Disable the extension and reinstall after signing out.",
        );
      const previous = structuredClone(record);
      const next: ExtensionRecord = {
        ...record,
        version: manifest.version,
        installed: true,
        enabled: record.installed === false ? true : record.enabled,
        permissions: pending.permissions,
        pending: undefined,
        error: undefined,
      };
      const transaction: Transaction = {
        previous,
        next,
        hadCurrent: await exists(this.directory(record.id)),
      };
      await fs.rm(this.backup(record.id), { recursive: true, force: true });
      await writeAtomic(this.journalFile(record.id), JSON.stringify(transaction));
      try {
        if (transaction.hadCurrent)
          await fs.rename(this.directory(record.id), this.backup(record.id));
        await fs.rename(stage, this.directory(record.id));
        await this.platform.clearExtensionCodeCache(this.directory(record.id));
        Object.assign(record, next);
        await this.load(record);
        await this.persist();
        await fs.rm(this.journalFile(record.id));
      } catch (error) {
        this.unload(record.id);
        await this.recover(record.id);
        const restored = this.record(record.id);
        if (restored.installed !== false) await this.load(restored).catch(() => {});
        throw error;
      }
      await fs.rm(this.backup(record.id), { recursive: true, force: true });
      await fs.rm(this.pendingFile(record.id), { force: true });
    } finally {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
  private async recover(id: string): Promise<void> {
    const transaction = JSON.parse(await fs.readFile(this.journalFile(id), "utf8")) as Transaction;
    if (transaction.previous.id !== id || transaction.next.id !== id)
      throw new Error("Invalid extension recovery journal");
    if (await exists(this.backup(id))) {
      await fs.rm(this.directory(id), { recursive: true, force: true });
      await fs.rename(this.backup(id), this.directory(id));
    } else if (!transaction.hadCurrent)
      await fs.rm(this.directory(id), { recursive: true, force: true });
    if (transaction.hadCurrent) await this.platform.clearExtensionCodeCache(this.directory(id));
    const restored = {
      ...transaction.previous,
      pending: undefined,
      failedVersion: transaction.next.version,
      error:
        "Installation was interrupted or failed. Previous version restored; check for updates to retry.",
    };
    this.records = this.records.filter((record) => record.id !== id).concat(restored);
    await this.persist();
    await fs.rm(this.journalFile(id));
  }
}
