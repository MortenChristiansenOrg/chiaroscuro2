/** HTTP client for the app-data-service document API (see docs/features/SyncFeature.specs.md). */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RemoteEntry {
  key: string;
  /** `null` for a deleted document (a tombstone). */
  value: JsonValue | null;
  revision: number;
  deleted: boolean;
}

/** Every installation of this browser shares documents under this application name. */
export const SYNC_APPLICATION = "chiaroscuro2";

/** `status` is 0 when the service could not be reached or answered with something unreadable. */
export class AppDataError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppDataError";
  }
}

export interface AppDataClient {
  /** Read one document, or `null` when it was never created. */
  get(namespace: string, key: string): Promise<RemoteEntry | null>;
  put(
    namespace: string,
    key: string,
    value: JsonValue,
    expectedRevision: number,
  ): Promise<RemoteEntry>;
  remove(namespace: string, key: string, expectedRevision: number): Promise<RemoteEntry>;
  /** Every document in a namespace, including tombstones. */
  list(namespace: string): Promise<RemoteEntry[]>;
  /** Confirm the key may read this application's documents. */
  check(namespace: string): Promise<void>;
}

/** Accept an HTTPS origin, or plain HTTP on this machine for a local deployment. */
export function normalizeServiceUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter the service URL, such as https://your-deployment.convex.site.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("The service URL must use HTTPS.");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Enter only the service address, without a path or query.");
  return url.origin;
}

export function validateApiKey(input: string): string {
  const key = input.trim();
  if (!/^ads_[a-f0-9]{64}$/i.test(key))
    throw new Error("Paste the key exactly as the service showed it. It starts with ads_.");
  return key;
}

// Keys may contain only printable ASCII without spaces; script ids and hostnames already
// do, but encoding keeps any other character from being rejected.
const encodeKey = (key: string) => encodeURIComponent(key);
function decodeKey(key: string): string | undefined {
  try {
    return decodeURIComponent(key);
  } catch {
    return undefined;
  }
}

interface WireEntry {
  key: string;
  value: JsonValue | null;
  revision: number;
  deleted: boolean;
}

export function createAppDataClient(options: {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Aborts every request, such as when the user disconnects. */
  signal?: AbortSignal;
}): AppDataClient {
  const origin = normalizeServiceUrl(options.url);
  const apiKey = validateApiKey(options.apiKey);
  const send = options.fetch ?? fetch;

  async function request<T>(
    path: string,
    method: string,
    params: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(path, origin);
    url.search = new URLSearchParams({ application: SYNC_APPLICATION, ...params }).toString();
    let response: Response;
    try {
      response = await send(url, {
        method,
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(options.timeoutMs ?? 30_000),
          ...(options.signal ? [options.signal] : []),
        ]),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new AppDataError(0, "NETWORK", "The sync service could not be reached.");
    }
    let result: { error?: { code?: string; message?: string } } & Record<string, unknown>;
    try {
      result = await response.json();
    } catch {
      throw new AppDataError(
        response.ok ? 0 : response.status,
        "INVALID_RESPONSE",
        "The sync service sent a response this browser could not read.",
      );
    }
    if (!response.ok)
      throw new AppDataError(
        response.status,
        result.error?.code ?? "HTTP_ERROR",
        // Messages reach Settings and logs; a proxy echoing the request must not leak the key.
        (result.error?.message ?? `The sync service answered with status ${response.status}.`)
          .split(apiKey)
          .join("[redacted]"),
      );
    return result as T;
  }

  function entry(wire: WireEntry): RemoteEntry {
    return {
      key: decodeKey(wire.key) ?? wire.key,
      value: wire.deleted ? null : wire.value,
      revision: wire.revision,
      deleted: wire.deleted,
    };
  }

  return {
    async get(namespace, key) {
      try {
        return entry(
          await request<WireEntry>("/v1/data", "GET", { namespace, key: encodeKey(key) }),
        );
      } catch (error) {
        if (error instanceof AppDataError && error.status === 404) return null;
        throw error;
      }
    },
    async put(namespace, key, value, expectedRevision) {
      return entry(
        await request<WireEntry>(
          "/v1/data",
          "PUT",
          { namespace, key: encodeKey(key) },
          { value, expectedRevision },
        ),
      );
    },
    async remove(namespace, key, expectedRevision) {
      return entry(
        await request<WireEntry>(
          "/v1/data",
          "DELETE",
          { namespace, key: encodeKey(key) },
          { expectedRevision },
        ),
      );
    },
    async list(namespace) {
      const entries: RemoteEntry[] = [];
      let cursor: string | null = null;
      do {
        const page: { entries: WireEntry[]; nextCursor: string | null } = await request(
          "/v1/entries",
          "GET",
          { namespace, ...(cursor === null ? {} : { cursor }) },
        );
        for (const wire of page.entries) {
          // A key this browser did not write cannot belong to any of its items.
          if (decodeKey(wire.key) !== undefined) entries.push(entry(wire));
        }
        cursor = page.nextCursor;
      } while (cursor !== null);
      return entries;
    },
    async check(namespace) {
      await request("/v1/entries", "GET", { namespace, limit: "1" });
    },
  };
}
