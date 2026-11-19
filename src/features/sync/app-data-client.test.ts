import { describe, expect, it, vi } from "vitest";
import { FAKE_APP_DATA_KEY } from "../../test-utils/fake-app-data-service";
import { AppDataError, createAppDataClient, normalizeServiceUrl } from "./app-data-client.main";

describe("app data client", () => {
  it("accepts only an HTTPS origin, or HTTP on this machine", () => {
    expect(normalizeServiceUrl(" https://a.convex.site/ ")).toBe("https://a.convex.site");
    expect(normalizeServiceUrl("http://127.0.0.1:3210")).toBe("http://127.0.0.1:3210");
    expect(() => normalizeServiceUrl("http://a.convex.site")).toThrow("HTTPS");
    expect(() => normalizeServiceUrl("https://a.convex.site/v1")).toThrow("without a path");
    expect(() => normalizeServiceUrl("https://user:pw@a.convex.site")).toThrow("without a path");
    expect(() => normalizeServiceUrl("nonsense")).toThrow("Enter the service URL");
  });

  it("sends the key as a bearer token, never in the URL, and encodes item keys", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: "a%20b", value: 1, revision: 2, deleted: false })),
    );
    const client = createAppDataClient({
      url: "https://sync.example",
      apiKey: FAKE_APP_DATA_KEY,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(await client.put("domains", "a b", 1, 1)).toEqual({
      key: "a b",
      value: 1,
      revision: 2,
      deleted: false,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://sync.example/v1/data?application=chiaroscuro2&namespace=domains&key=a%2520b",
    );
    expect(url.toString()).not.toContain(FAKE_APP_DATA_KEY);
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${FAKE_APP_DATA_KEY}`,
      "Content-Type": "application/json",
    });
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ value: 1, expectedRevision: 1 });
  });

  it("turns failures into errors with the service's code and message", async () => {
    const respond = (response: Response | Error) =>
      createAppDataClient({
        url: "https://sync.example",
        apiKey: FAKE_APP_DATA_KEY,
        fetch: (async () => {
          if (response instanceof Error) throw response;
          return response;
        }) as typeof fetch,
      });
    await expect(
      respond(
        new Response(JSON.stringify({ error: { code: "READ_ONLY", message: "Read only." } }), {
          status: 403,
        }),
      ).put("domains", "a", 1, 0),
    ).rejects.toMatchObject({ status: 403, code: "READ_ONLY", message: "Read only." });
    await expect(respond(new TypeError("fetch failed")).list("domains")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK",
    });
    const error = await respond(new Response("<html>", { status: 502 }))
      .list("domains")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppDataError);
    expect(error).toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("reads a missing document as null", async () => {
    const client = createAppDataClient({
      url: "https://sync.example",
      apiKey: FAKE_APP_DATA_KEY,
      fetch: (async () =>
        new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Missing." } }), {
          status: 404,
        })) as typeof fetch,
    });
    expect(await client.get("domains", "a")).toBeNull();
  });

  it("never repeats the key in an error message", async () => {
    const client = createAppDataClient({
      url: "https://sync.example",
      apiKey: FAKE_APP_DATA_KEY,
      fetch: (async () =>
        new Response(
          JSON.stringify({
            error: { code: "BAD", message: `Rejected Bearer ${FAKE_APP_DATA_KEY}` },
          }),
          { status: 400 },
        )) as typeof fetch,
    });
    await expect(client.list("domains")).rejects.toThrow("Rejected Bearer [redacted]");
  });
});
