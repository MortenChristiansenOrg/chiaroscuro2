import type { Cookie, Session } from "electron";

const COOKIE_NAMES = [
  "user_session",
  "__Host-user_session_same_site",
  "logged_in",
  "dotcom_user",
  "_gh_sess",
] as const;
const AUTH_COOKIES = new Set<string>(COOKIE_NAMES);
const LIMIT = 500;
const FILTER = { urls: ["https://github.com/*"] };

type Entry = { timestamp: number; session: number; kind: string; data: unknown };

/** Categorize routes without retaining account/repository paths, queries, or redirect tokens. */
function route(url: string): "sign-in" | "session" | "github-page" | "external" {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com" || parsed.protocol !== "https:") return "external";
    if (parsed.pathname === "/login" || parsed.pathname.startsWith("/login/")) return "sign-in";
    if (parsed.pathname === "/session" || parsed.pathname.startsWith("/sessions/"))
      return "session";
    return "github-page";
  } catch {
    return "external";
  }
}

function cookieMetadata(cookie: Cookie) {
  return {
    name: cookie.name,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    sessionCookie: cookie.session,
    expiresAt: cookie.expirationDate ?? null,
    rootPath: cookie.path === "/",
  };
}

function isAuthCookie(cookie: Cookie): boolean {
  return AUTH_COOKIES.has(cookie.name) && cookie.domain?.replace(/^\./, "") === "github.com";
}

function header(headers: Record<string, string>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

function cookiePresence(headers: Record<string, string>) {
  const names = new Set(
    (header(headers, "cookie") ?? "")
      .split(";")
      .map((part) => part.slice(0, part.indexOf("=")).trim()),
  );
  return Object.fromEntries(COOKIE_NAMES.map((name) => [name, names.has(name)]));
}

/** Passive, in-memory evidence for #49. Never retain cookie values, authentication headers, URLs, or page content. */
export class GithubSessionDiagnostics {
  private readonly sessions = new Map<Session, number>();
  private readonly entries: Entry[] = [];

  private record(session: number, kind: string, data: unknown) {
    this.entries.push({ timestamp: Date.now(), session, kind, data });
    if (this.entries.length > LIMIT) this.entries.shift();
  }

  observe(ses: Session): void {
    if (this.sessions.has(ses)) return;
    const id = this.sessions.size + 1;
    this.sessions.set(ses, id);
    this.record(id, "session-ready", {
      persistent: ses.isPersistent(),
      userAgent: ses.getUserAgent(),
    });
    ses.cookies.on("changed", (_event, cookie, cause, removed) => {
      if (isAuthCookie(cookie))
        this.record(id, "cookie-changed", { ...cookieMetadata(cookie), cause, removed });
    });
    // Electron allows one observer per webRequest event. These hooks currently have no
    // other owner; future consumers must compose with them instead of replacing them.
    ses.webRequest.onSendHeaders(FILTER, (details) => {
      if (details.resourceType !== "mainFrame" || route(details.url) === "external") return;
      const contents = details.webContents;
      this.record(id, "request", {
        requestId: details.id,
        webContentsId: details.webContentsId ?? null,
        route: route(details.url),
        sentCookies: cookiePresence(details.requestHeaders),
        userAgent: header(details.requestHeaders, "user-agent")?.slice(0, 512) ?? null,
        tabUserAgent:
          contents && !contents.isDestroyed() ? contents.getUserAgent().slice(0, 512) : null,
      });
    });
    ses.webRequest.onBeforeRedirect(FILTER, (details) => {
      if (details.resourceType !== "mainFrame" || route(details.url) === "external") return;
      const destination = route(details.redirectURL);
      this.record(id, "redirect", {
        requestId: details.id,
        status: details.statusCode,
        from: route(details.url),
        to: destination,
      });
      if (destination === "sign-in") void this.snapshotSession(ses, id, "sign-in-redirect");
    });
    ses.webRequest.onCompleted(FILTER, (details) => {
      if (details.resourceType !== "mainFrame" || route(details.url) === "external") return;
      this.record(id, "response", {
        requestId: details.id,
        status: details.statusCode,
        route: route(details.url),
      });
    });
    void this.snapshotSession(ses, id, "session-ready");
  }

  private async snapshotSession(ses: Session, id: number, reason: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const cookies = await ses.cookies.get({ domain: "github.com" });
      this.record(id, "cookie-snapshot", {
        reason,
        startedAt,
        cookies: cookies.filter(isAuthCookie).map(cookieMetadata),
      });
    } catch {
      // Error text can include paths or request data; retain only the failed operation.
      this.record(id, "snapshot-unavailable", { reason });
    }
  }

  async snapshot(reason: "suspend" | "resume"): Promise<void> {
    for (const id of this.sessions.values()) this.record(id, reason, {});
    await Promise.all([...this.sessions].map(([ses, id]) => this.snapshotSession(ses, id, reason)));
  }

  getState() {
    return {
      scope: "GitHub authentication metadata only",
      maxEntries: LIMIT,
      entries: this.entries.slice(),
    };
  }
}
