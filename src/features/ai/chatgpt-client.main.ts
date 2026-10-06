import { createHash, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { MODEL_DEFAULT_EFFORT } from "./ai.shared";
import { parseModelCatalog } from "./model-catalog.main";

const AUTH = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const jwks = createRemoteJWKSet(new URL(`${AUTH}/.well-known/jwks.json`));
interface Credentials {
  hostId: string;
  clientId?: string;
  subject?: string;
  account?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  scopes?: string[];
  pendingValidation?: boolean;
}
export interface CredentialProtection {
  encrypt(value: string): Uint8Array;
  decrypt(value: Uint8Array): string;
}
export interface AiInput {
  role: "user" | "assistant";
  content:
    | string
    | ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string })[];
}
export interface AiProvider {
  status(): { connected: boolean; sharing: boolean; account?: string };
  load(): Promise<void>;
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  models(signal: AbortSignal): Promise<{ slug: string; name: string; efforts: string[] }[]>;
  respond(options: {
    model: string;
    effort: string;
    instructions: string;
    input: AiInput[];
    signal: AbortSignal;
  }): Promise<string>;
}

export function recoveryMessage(status: number, code?: string): string {
  if (code === "subscription_sharing_usage_limit_exceeded" || status === 429)
    return "ChatGPT usage limit reached. Open Manage usage in Settings → AI to review app limits, then try again when allowance is available.";
  if (code === "invalid_grant" || code?.includes("refresh_token"))
    return "Your ChatGPT session expired or was revoked. Reconnect in Settings → AI.";
  if (status === 401)
    return "ChatGPT could not authorize this request. Reconnect in Settings → AI.";
  if (status === 403)
    return "ChatGPT plan access is unavailable for this account, workspace, region, or permission. Check Settings → AI and your ChatGPT permissions.";
  if (status === 503)
    return "ChatGPT is temporarily unavailable. Your connection is saved; try again later.";
  return "ChatGPT could not complete this request. Check the model and reasoning effort in Settings → AI, then try again.";
}
async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string } | string;
    };
    const code = typeof body.error === "string" ? body.error : body.error?.code;
    const error = new Error(`${recoveryMessage(response.status, code)}${code ? ` (${code})` : ""}`);
    Object.assign(error, { code });
    throw error;
  }
  return response;
}

/** Credentials stay in main and are encrypted with Electron's OS-backed safeStorage. */
export function createChatGptClient(
  directory: string,
  protection: CredentialProtection,
  openBrowser: (url: string) => Promise<void>,
): AiProvider {
  const file = path.join(directory, "chatgpt-credentials.enc");
  let credentials: Credentials = { hostId: `urn:uuid:${randomUUID()}` };
  let refresh: Promise<void> | undefined;
  let epoch = 0;
  async function save() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, protection.encrypt(JSON.stringify(credentials)), { mode: 0o600 });
      await fs.rename(temp, file);
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  async function verify(idToken: string, clientId: string, nonce?: string) {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: AUTH,
      audience: clientId,
      algorithms: ["RS256"],
    });
    if (!payload.exp || !payload.sub || (nonce && payload.nonce !== nonce))
      throw new Error("ChatGPT identity validation failed. Sign in again.");
    if (credentials.subject && credentials.subject !== payload.sub)
      throw new Error("Reconnect with the original ChatGPT account.");
    return {
      subject: payload.sub,
      account:
        typeof payload.email === "string"
          ? payload.email
          : typeof payload.name === "string"
            ? payload.name
            : payload.sub,
    };
  }
  async function token(form: URLSearchParams) {
    const response = await checked(
      await fetch(`${AUTH}/api/accounts/oauth/token`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60000),
      }),
    );
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
      scope?: string;
    };
  }
  async function access(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!credentials.accessToken) throw new Error("Connect ChatGPT in Settings → AI.");
    if (credentials.pendingValidation)
      throw new Error(
        "Your renewed ChatGPT identity could not be verified. Reconnect in Settings → AI.",
      );
    if ((credentials.expiresAt ?? 0) <= Date.now() + 60000) {
      if (!refresh) {
        const operation = epoch;
        refresh = (async () => {
          if (!credentials.refreshToken || !credentials.clientId)
            throw new Error("Your ChatGPT session expired. Reconnect in Settings → AI.");
          try {
            const result = await token(
              new URLSearchParams({
                grant_type: "refresh_token",
                client_id: credentials.clientId,
                refresh_token: credentials.refreshToken,
                resource: RESOURCE,
              }),
            );
            if (operation !== epoch) throw new Error("Connection changed.");
            if (!result.access_token || !Number.isFinite(result.expires_in))
              throw new Error("ChatGPT returned invalid credentials. Reconnect in Settings → AI.");
            credentials = {
              ...credentials,
              accessToken: result.access_token,
              refreshToken: result.refresh_token ?? credentials.refreshToken,
              expiresAt: Date.now() + result.expires_in * 1000,
              scopes: result.scope?.split(" ") ?? credentials.scopes,
              idToken: result.id_token ?? credentials.idToken,
              pendingValidation: !!result.id_token,
            };
            // Persist rotation before remote identity verification so an outage cannot lose it.
            await save();
            if (result.id_token) {
              const identity = await verify(result.id_token, credentials.clientId!);
              if (operation !== epoch) throw new Error("Connection changed.");
              credentials = { ...credentials, ...identity, pendingValidation: false };
              await save();
            }
          } catch (error) {
            const code = (error as { code?: string }).code;
            if (
              [
                "invalid_grant",
                "invalid_refresh_token",
                "token_expired",
                "refresh_token_expired",
                "refresh_token_invalidated",
                "refresh_token_reused",
              ].includes(code ?? "") &&
              operation === epoch
            ) {
              credentials = {
                hostId: credentials.hostId,
                clientId: credentials.clientId,
                subject: credentials.subject,
                account: credentials.account,
              };
              await save();
            }
            throw error;
          }
        })().finally(() => {
          refresh = undefined;
        });
      }
      await refresh;
    }
    signal.throwIfAborted();
    if (!credentials.scopes?.includes("chatgpt.tokens.use.direct"))
      throw new Error("Enable ChatGPT plan usage by reconnecting in Settings → AI.");
    return credentials.accessToken!;
  }
  return {
    status: () => ({
      connected: !!credentials.accessToken && !credentials.pendingValidation,
      sharing:
        !!credentials.accessToken &&
        !credentials.pendingValidation &&
        !!credentials.scopes?.includes("chatgpt.tokens.use.direct"),
      account: credentials.account,
    }),
    async load() {
      try {
        credentials = JSON.parse(protection.decrypt(await fs.readFile(file))) as Credentials;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error("Cannot read protected ChatGPT credentials. Check your system keyring.");
      }
    },
    async connect(signal) {
      const operation = epoch;
      const state = randomBytes(32).toString("base64url");
      const nonce = randomBytes(32).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      let settle: (value: URL | PromiseLike<URL>) => void;
      let reject: (error: Error) => void;
      const callback = new Promise<URL>((resolve, fail) => {
        settle = resolve;
        reject = fail;
      });
      void callback.catch(() => {});
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/auth/callback" || url.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid callback.");
          return;
        }
        res
          .writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" })
          .end("You can return to Chiaroscuro.");
        settle(url);
      });
      const abort = () => reject(new Error("ChatGPT sign-in cancelled."));
      try {
        await save(); // Retain host ID before the first authorization attempt.
        await new Promise<void>((resolve, fail) => {
          server.once("error", fail);
          server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Cannot start ChatGPT callback listener.");
        const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
        const params = new URLSearchParams({
          client_id: credentials.clientId ?? "dynamic_agent_client",
          ext_agent_host_id: credentials.hostId,
          response_type: "code",
          redirect_uri: redirectUri,
          scope: SCOPES,
          resource: RESOURCE,
          state,
          nonce,
          code_challenge_method: "S256",
          code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        });
        if (!credentials.clientId) params.set("agent_name_hint", "Chiaroscuro");
        if (credentials.idToken) params.set("id_token_hint", credentials.idToken);
        if (credentials.clientId && !credentials.scopes?.includes("chatgpt.tokens.use.direct"))
          params.set("prompt", "consent");
        signal.throwIfAborted();
        signal.addEventListener("abort", abort, { once: true });
        await openBrowser(`${AUTH}/api/accounts/authorize?${params}`);
        const url = await callback;
        signal.throwIfAborted();
        if (url.searchParams.has("error"))
          throw new Error("ChatGPT sign-in was declined. Connect again when ready.");
        const issued = url.searchParams.get("client_id");
        const clientId = credentials.clientId ?? issued;
        const code = url.searchParams.get("code");
        if (
          !clientId ||
          clientId === "dynamic_agent_client" ||
          !code ||
          (issued && issued !== clientId)
        )
          throw new Error("ChatGPT registration was incomplete. Try again.");
        credentials.clientId = clientId;
        await save();
        const result = await token(
          new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
            resource: RESOURCE,
          }),
        );
        if (!result.id_token || !result.access_token || !Number.isFinite(result.expires_in))
          throw new Error("ChatGPT returned invalid credentials.");
        const identity = await verify(result.id_token, clientId, nonce);
        signal.throwIfAborted();
        if (epoch !== operation) throw new Error("Connection changed.");
        credentials = {
          ...credentials,
          ...identity,
          pendingValidation: false,
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          idToken: result.id_token,
          expiresAt: Date.now() + result.expires_in * 1000,
          scopes: result.scope?.split(" ") ?? [],
        };
        await save();
      } finally {
        signal.removeEventListener("abort", abort);
        server.close();
        server.closeAllConnections();
      }
    },
    async disconnect() {
      epoch++;
      if (refresh) await refresh.catch(() => {});
      credentials = {
        hostId: credentials.hostId,
        clientId: credentials.clientId,
        subject: credentials.subject,
        account: credentials.account,
      };
      await save();
    },
    async models(signal) {
      const bearer = await access(signal);
      const response = await checked(
        await fetch(`${RESOURCE}/models`, {
          headers: { Authorization: `Bearer ${bearer}` },
          signal,
        }),
      );
      return parseModelCatalog(await response.json());
    },
    async respond(options) {
      const bearer = await access(options.signal);
      const response = await checked(
        await fetch(`${RESOURCE}/responses`, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: options.model,
            ...(options.effort === MODEL_DEFAULT_EFFORT
              ? {}
              : { reasoning: { effort: options.effort } }),
            instructions: options.instructions,
            input: options.input,
            store: false,
            stream: true,
          }),
          signal: options.signal,
        }),
      );
      return readResponseStream(response, options.signal);
    },
  };
}

export async function readResponseStream(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error("ChatGPT returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let output = "";
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      pending = pending.replace(/\r\n/g, "\n");
      let boundary = pending.indexOf("\n\n");
      while (boundary >= 0) {
        const block = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") {
          const event = JSON.parse(data) as {
            type: string;
            delta?: string;
            error?: { code?: string };
            response?: { error?: { code?: string } };
          };
          if (event.type === "response.output_text.delta") output += event.delta ?? "";
          if (["error", "response.failed", "response.incomplete"].includes(event.type))
            throw new Error(
              recoveryMessage(
                event.response?.error?.code === "subscription_sharing_usage_limit_exceeded"
                  ? 429
                  : 400,
                event.response?.error?.code ?? event.error?.code,
              ),
            );
          if (event.type === "response.completed") {
            if (!output.trim())
              throw new Error("ChatGPT returned no code. Try again with a more specific request.");
            return output;
          }
        }
        boundary = pending.indexOf("\n\n");
      }
      if (pending.length + output.length > 2000000)
        throw new Error("ChatGPT response was too large. Try a smaller request.");
      if (chunk.done)
        throw new Error(
          "ChatGPT stopped before completing the response. Your draft is unchanged; try again.",
        );
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
