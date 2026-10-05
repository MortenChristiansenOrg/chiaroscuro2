import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createChatGptClient, readResponseStream } from "./chatgpt-client.main";

const keys = vi.hoisted(() => ({ publicKey: undefined as CryptoKey | undefined }));
vi.mock("jose", async (original) => ({
  ...(await original<typeof import("jose")>()),
  createRemoteJWKSet: () => async () => keys.publicKey,
}));
let privateKey: CryptoKey;
let directory: string;
const fetchOriginal = globalThis.fetch;
const key = randomBytes(32);
const protection = {
  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]);
  },
  decrypt(value: Uint8Array) {
    const bytes = Buffer.from(value);
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString();
  },
};
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys.publicKey = pair.publicKey;
});
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-ai-auth-"));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(directory, { recursive: true, force: true });
});

async function login(options: { scopes?: string; badNonce?: boolean; expiresIn?: number } = {}) {
  let auth: URL;
  let tokenBody: URLSearchParams | undefined;
  const network = vi.fn(
    async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (String(url).includes("/oauth/token")) {
        tokenBody = init?.body as URLSearchParams;
        const id = await new SignJWT({
          nonce: options.badNonce ? "wrong" : auth.searchParams.get("nonce"),
          email: "person@example.com",
        })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer("https://auth.openai.com")
          .setAudience("oaiapp_test")
          .setSubject("verified-subject")
          .setExpirationTime("1h")
          .sign(privateKey);
        return Response.json({
          access_token: "private-access",
          refresh_token: "private-refresh",
          id_token: id,
          expires_in: options.expiresIn ?? 3600,
          scope: options.scopes ?? "openid chatgpt.tokens.use.direct",
        });
      }
      if (String(url).endsWith("/models"))
        return Response.json({
          models: [
            { slug: "gpt-6-luna", display_name: "GPT-6 Luna", visibility: "list" },
            { slug: "hidden", visibility: "hidden" },
          ],
        });
      return fetchOriginal(url, init);
    },
  );
  vi.stubGlobal("fetch", network);
  const open = vi.fn(async (url: string) => {
    auth = new URL(url);
    const callback = new URL(auth.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", auth.searchParams.get("state")!);
    callback.searchParams.set("code", "test-code");
    callback.searchParams.set("client_id", "oaiapp_test");
    const invalid = new URL(callback);
    invalid.searchParams.set("state", "wrong");
    expect((await fetchOriginal(invalid)).status).toBe(400);
    expect((await fetchOriginal(callback)).status).toBe(200);
  });
  const client = createChatGptClient(directory, protection, open);
  await client.load();
  return {
    client,
    open,
    network,
    connect: () => client.connect(AbortSignal.timeout(5000)),
    getAuth: () => auth,
    getTokenBody: () => tokenBody,
  };
}

describe("ChatGPT OAuth", () => {
  it("uses loopback PKCE, nonce and plan scopes, encrypts credentials, and reloads without exposing tokens", async () => {
    const fixture = await login();
    await fixture.connect();
    const auth = fixture.getAuth();
    expect(auth.hostname).toBe("auth.openai.com");
    expect(auth.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(auth.searchParams.get("ext_agent_host_id")).toMatch(/^urn:uuid:/);
    expect(auth.searchParams.get("scope")).toContain("chatgpt.tokens.use.direct");
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(fixture.getTokenBody()?.get("client_id")).toBe("oaiapp_test");
    expect(fixture.getTokenBody()?.get("redirect_uri")).toBe(auth.searchParams.get("redirect_uri"));
    const bytes = await fs.readFile(path.join(directory, "chatgpt-credentials.enc"));
    expect(bytes.toString()).not.toContain("private-access");
    expect((await fs.stat(path.join(directory, "chatgpt-credentials.enc"))).mode & 0o777).toBe(
      0o600,
    );
    const restored = createChatGptClient(directory, protection, async () => {});
    await restored.load();
    expect(restored.status()).toEqual({
      connected: true,
      sharing: true,
      account: "person@example.com",
    });
    expect(JSON.stringify(restored.status())).not.toContain("private-");
    expect((await restored.models(AbortSignal.timeout(5000))).map((m) => m.slug)).toEqual([
      "gpt-6-luna",
    ]);
  });
  it("rejects a validly signed identity with the wrong nonce", async () => {
    const fixture = await login({ badNonce: true });
    await expect(fixture.connect()).rejects.toThrow("identity validation");
    expect(fixture.client.status().sharing).toBe(false);
  });
  it("retains identity-only sign-in but never allows inference", async () => {
    const fixture = await login({ scopes: "openid email" });
    await fixture.connect();
    expect(fixture.client.status()).toMatchObject({ connected: true, sharing: false });
    await expect(fixture.client.models(AbortSignal.timeout(5000))).rejects.toThrow(
      "Enable ChatGPT plan usage",
    );
  });
  it("removes tokens on sign-out and reuses the host and issued client ID on reconnect", async () => {
    const fixture = await login();
    await fixture.connect();
    const host = fixture.getAuth().searchParams.get("ext_agent_host_id");
    await fixture.client.disconnect();
    expect(fixture.client.status()).toMatchObject({ connected: false, sharing: false });
    await fixture.connect();
    expect(fixture.getAuth().searchParams.get("client_id")).toBe("oaiapp_test");
    expect(fixture.getAuth().searchParams.get("ext_agent_host_id")).toBe(host);
  });
  it("repairs a pending refresh-validation failure through a successful reconnect", async () => {
    const fixture = await login();
    await fixture.connect();
    const file = path.join(directory, "chatgpt-credentials.enc");
    const stored = JSON.parse(protection.decrypt(await fs.readFile(file)));
    await fs.writeFile(
      file,
      protection.encrypt(JSON.stringify({ ...stored, pendingValidation: true })),
    );
    await fixture.client.load();
    expect(fixture.client.status().sharing).toBe(false);
    await fixture.connect();
    expect(fixture.client.status().sharing).toBe(true);
    const renewed = JSON.parse(protection.decrypt(await fs.readFile(file)));
    expect(renewed.pendingValidation).toBe(false);
  });
  it("cancels sign-in and closes its listener", async () => {
    let callback: string | null = null;
    const controller = new AbortController();
    const client = createChatGptClient(directory, protection, async (url) => {
      callback = new URL(url).searchParams.get("redirect_uri");
      controller.abort();
    });
    await expect(client.connect(controller.signal)).rejects.toThrow("cancelled");
    expect(client.status().sharing).toBe(false);
    await expect(fetchOriginal(callback!)).rejects.toThrow();
  });
});

describe("Responses streaming", () => {
  const stream = (body: string) =>
    new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  it("accepts streamed text only after response.completed", async () => {
    const body =
      'data: {"type":"response.output_text.delta","delta":"h1 { color: red; }"}\r\n\r\ndata: {"type":"response.completed"}\r\n\r\n';
    await expect(readResponseStream(stream(body), AbortSignal.timeout(5000))).resolves.toContain(
      "color: red",
    );
    await expect(
      readResponseStream(
        stream(body.split('data: {"type":"response.completed"}')[0]),
        AbortSignal.timeout(5000),
      ),
    ).rejects.toThrow("before completing");
  });
  it("rejects incomplete responses and gives usage-limit recovery guidance", async () => {
    await expect(
      readResponseStream(
        stream('data: {"type":"response.incomplete"}\n\n'),
        AbortSignal.timeout(5000),
      ),
    ).rejects.toThrow("could not complete");
    await expect(
      readResponseStream(
        stream(
          'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n',
        ),
        AbortSignal.timeout(5000),
      ),
    ).rejects.toThrow("Manage usage");
  });
});
