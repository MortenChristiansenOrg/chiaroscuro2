import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CredentialProtection } from "../ai/chatgpt-client.main";
import type { PersistedSyncState } from "./sync-engine.main";

export interface SyncCredentials {
  url: string;
  apiKey: string;
}

const CREDENTIALS = "credentials.enc";
const STATE = "state.json";

async function writeAtomically(file: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, data, { mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

async function readOptional(file: string): Promise<Buffer | undefined> {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The key stays in the main process, encrypted with the system keyring. */
export function createSyncFiles(directory: string, protection: CredentialProtection) {
  return {
    async saveCredentials(credentials: SyncCredentials) {
      await writeAtomically(
        path.join(directory, CREDENTIALS),
        protection.encrypt(JSON.stringify(credentials)),
      );
    },
    async loadCredentials(): Promise<SyncCredentials | undefined> {
      const data = await readOptional(path.join(directory, CREDENTIALS));
      if (!data) return undefined;
      const parsed = JSON.parse(protection.decrypt(data)) as Partial<SyncCredentials>;
      if (typeof parsed.url !== "string" || typeof parsed.apiKey !== "string")
        throw new Error("The saved sync key is unreadable.");
      return { url: parsed.url, apiKey: parsed.apiKey };
    },
    /** What this machine last agreed with `service`; a different service starts afresh. */
    async loadState(service: string): Promise<PersistedSyncState> {
      const data = await readOptional(path.join(directory, STATE));
      if (data) {
        try {
          const state = JSON.parse(data.toString("utf8")) as PersistedSyncState;
          if (state.service === service && state.records && typeof state.records === "object")
            return state;
        } catch {
          // An unreadable file is treated like a first sync, which never loses local data.
        }
      }
      return { service, records: {} };
    },
    async saveState(state: PersistedSyncState) {
      await writeAtomically(path.join(directory, STATE), JSON.stringify(state));
    },
    async clear() {
      await fs.rm(path.join(directory, CREDENTIALS), { force: true });
      await fs.rm(path.join(directory, STATE), { force: true });
    },
  };
}
export type SyncFiles = ReturnType<typeof createSyncFiles>;
