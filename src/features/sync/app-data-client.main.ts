/** HTTP client for the app-data-service document API (see docs/features/SyncFeature.specs.md). */
import { z } from "zod";

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

// Responses are checked like any other outside input: a wrong shape must not reach the
// revision comparisons that decide what to change.
/** Only fields of the expected type are used; anything else falls back to the status. */
const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
  }),
});

const WireEntrySchema = z.object({
  key: z.string(),
  value: z.json().nullable(),
  revision: z.number().int().nonnegative(),
  deleted: z.boolean(),
});
const WirePageSchema = z.object({
  entries: z.array(WireEntrySchema),
  nextCursor: z.string().nullable(),
});
/** Far more documents than this browser writes; a service paging past it is misbehaving. */
const MAX_PAGES = 10_000;

function invalidResponse(): AppDataError {
  return new AppDataError(
    0,
    "INVALID_RESPONSE",
    "The sync service sent a response this browser could not read.",
  );
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

  async function request(
    path: string,
    method: string,
    params: Record<string, string>,
    body?: unknown,
  ): Promise<unknown> {
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
    let result: unknown;
    let readable = true;
    try {
      result = await response.json();
    } catch {
      readable = false;
    }
    // 409 always means another write came first, whatever the body says, so the item is
    // reconciled again instead of reported.
    if (!readable && response.status !== 409)
      throw new AppDataError(
        response.ok ? 0 : response.status,
        "INVALID_RESPONSE",
        "The sync service sent a response this browser could not read.",
      );
    if (!response.ok) {
      // Whatever the body holds, the status still decides what the failure means.
      const error = ErrorBodySchema.safeParse(result).data?.error;
      throw new AppDataError(
        response.status,
        response.status === 409 ? "REVISION_CONFLICT" : (error?.code ?? "HTTP_ERROR"),
        // Messages reach Settings and logs; a proxy echoing the request must not leak the key.
        (error?.message ?? `The sync service answered with status ${response.status}.`)
          .split(apiKey)
          .join("[redacted]"),
      );
    }
    return result;
  }

  function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw invalidResponse();
    return parsed.data;
  }

  function entry(response: unknown): RemoteEntry {
    const wire = parse(WireEntrySchema, response);
    return {
      key: decodeKey(wire.key) ?? wire.key,
      value: wire.deleted ? null : (wire.value as JsonValue),
      revision: wire.revision,
      deleted: wire.deleted,
    };
  }

  return {
    async get(namespace, key) {
      try {
        return entry(await request("/v1/data", "GET", { namespace, key: encodeKey(key) }));
      } catch (error) {
        if (error instanceof AppDataError && error.status === 404) return null;
        throw error;
      }
    },
    async put(namespace, key, value, expectedRevision) {
      return entry(
        await request(
          "/v1/data",
          "PUT",
          { namespace, key: encodeKey(key) },
          { value, expectedRevision },
        ),
      );
    },
    async remove(namespace, key, expectedRevision) {
      return entry(
        await request(
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
      for (let pages = 0; ; pages++) {
        if (pages >= MAX_PAGES) throw invalidResponse();
        const page: z.infer<typeof WirePageSchema> = parse(
          WirePageSchema,
          await request("/v1/entries", "GET", {
            namespace,
            ...(cursor === null ? {} : { cursor }),
          }),
        );
        for (const wire of page.entries) {
          // A key this browser did not write cannot belong to any of its items.
          if (decodeKey(wire.key) !== undefined) entries.push(entry(wire));
        }
        // Keys come in ascending order, so a cursor that doesn't move on would loop forever.
        if (page.nextCursor !== null && cursor !== null && page.nextCursor <= cursor)
          throw invalidResponse();
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }
      return entries;
    },
    async check(namespace) {
      await request("/v1/entries", "GET", { namespace, limit: "1" });
    },
  };
}
