/**
 * In-memory stand-in for app-data-service's document API (`/v1/data`, `/v1/entries`), with
 * revisions, tombstones, read-only keys and a size limit. Unit tests pass `fetch`; e2e
 * scenarios serve `handle` over HTTP.
 */
export interface FakeAppDataOptions {
  /** Keys this service accepts, with whether they may write. */
  keys?: Record<string, { application?: string; readOnly?: boolean }>;
  maxValueBytes?: number;
  pageSize?: number;
}

interface Document {
  key: string;
  json: string;
  revision: number;
  deleted: boolean;
  updatedAt: number;
}

export const FAKE_APP_DATA_KEY = `ads_${"a".repeat(64)}`;

export function createFakeAppDataService(options: FakeAppDataOptions = {}) {
  const keys = options.keys ?? { [FAKE_APP_DATA_KEY]: {} };
  const maxValueBytes = options.maxValueBytes ?? 128 * 1024;
  const pageSize = options.pageSize ?? 25;
  const documents = new Map<string, Map<string, Document>>();
  const requests: { method: string; path: string; namespace: string; key?: string }[] = [];
  let offline = false;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fail = (status: number, code: string, message: string) =>
    json({ error: { code, message } }, status);
  const space = (namespace: string) => {
    let docs = documents.get(namespace);
    if (!docs) {
      docs = new Map();
      documents.set(namespace, docs);
    }
    return docs;
  };
  const entry = (doc: Document) => ({
    key: doc.key,
    value: JSON.parse(doc.json),
    revision: doc.revision,
    deleted: doc.deleted,
    updatedAt: doc.updatedAt,
  });

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const namespace = url.searchParams.get("namespace") ?? "default";
    const key = url.searchParams.get("key") ?? undefined;
    requests.push({ method: request.method, path: url.pathname, namespace, key });
    const grant = keys[request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? ""];
    if (!grant) return fail(401, "INVALID_API_KEY", "API key is invalid, expired, or revoked.");
    if ((grant.application ?? "chiaroscuro2") !== url.searchParams.get("application"))
      return fail(
        403,
        "APPLICATION_MISMATCH",
        "This key does not grant access to that application.",
      );
    const docs = space(namespace);
    if (url.pathname === "/v1/entries") {
      const sorted = [...docs.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
      const cursor = url.searchParams.get("cursor");
      const limit = Number(url.searchParams.get("limit") ?? pageSize);
      const start = cursor ? sorted.filter((doc) => doc.key <= cursor).length : 0;
      const page = sorted.slice(start, start + Math.min(limit, pageSize));
      const more = start + page.length < sorted.length;
      return json({ entries: page.map(entry), nextCursor: more ? page.at(-1)?.key : null });
    }
    if (url.pathname !== "/v1/data" || key === undefined)
      return fail(404, "NOT_FOUND", "Not found.");
    const existing = docs.get(key);
    if (request.method === "GET")
      return existing ? json(entry(existing)) : fail(404, "NOT_FOUND", "Document not found.");
    if (grant.readOnly) return fail(403, "READ_ONLY", "This key only grants read access.");
    const body = (await request.json()) as { value?: unknown; expectedRevision: number };
    if (body.expectedRevision !== (existing?.revision ?? 0))
      return fail(409, "REVISION_CONFLICT", "The document changed. Read it again.");
    if (request.method === "DELETE" && !existing)
      return fail(404, "NOT_FOUND", "Document not found.");
    const text = request.method === "DELETE" ? "null" : JSON.stringify(body.value);
    if (new TextEncoder().encode(text).byteLength > maxValueBytes)
      return fail(413, "VALUE_TOO_LARGE", `JSON values are limited to ${maxValueBytes} bytes.`);
    const doc: Document = {
      key,
      json: text,
      revision: (existing?.revision ?? 0) + 1,
      deleted: request.method === "DELETE",
      updatedAt: Date.now(),
    };
    docs.set(key, doc);
    return json(entry(doc));
  }

  return {
    handle,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (offline) throw new TypeError("fetch failed");
      return handle(new Request(input, init));
    }) as typeof fetch,
    requests,
    setOffline(value: boolean) {
      offline = value;
    },
    /** The current value of a document; `null` for a tombstone, `undefined` when absent. */
    value(namespace: string, key: string): unknown {
      const doc = space(namespace).get(key);
      return doc && (doc.deleted ? null : JSON.parse(doc.json));
    },
    revision(namespace: string, key: string): number {
      return space(namespace).get(key)?.revision ?? 0;
    },
    /** Write as another machine would. */
    write(namespace: string, key: string, value: unknown | null) {
      const existing = space(namespace).get(key);
      space(namespace).set(key, {
        key,
        json: JSON.stringify(value),
        revision: (existing?.revision ?? 0) + 1,
        deleted: value === null,
        updatedAt: Date.now(),
      });
    },
  };
}
export type FakeAppDataService = ReturnType<typeof createFakeAppDataService>;
