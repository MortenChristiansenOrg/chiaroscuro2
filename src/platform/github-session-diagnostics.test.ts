import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { GithubSessionDiagnostics } from "./github-session-diagnostics";

function fixture() {
  const cookies = Object.assign(new EventEmitter(), {
    get: vi.fn(async () => [
      {
        name: "user_session",
        value: "SECRET_COOKIE",
        domain: ".github.com",
        path: "/",
        secure: true,
        httpOnly: true,
        session: false,
        expirationDate: 1900000000,
      },
      { name: "unrelated", value: "SECRET_UNRELATED", domain: ".github.com" },
    ]),
  });
  const webRequest = { onSendHeaders: vi.fn(), onBeforeRedirect: vi.fn(), onCompleted: vi.fn() };
  const ses = {
    cookies,
    webRequest,
    getUserAgent: () => "Chrome/test",
    isPersistent: () => true,
  } as unknown as Electron.Session;
  const diagnostics = new GithubSessionDiagnostics();
  diagnostics.observe(ses);
  return { diagnostics, ses, cookies, webRequest };
}

describe("GitHub authentication diagnostics", () => {
  it("keeps metadata, correlates sent cookies and login redirects, and never retains secrets", async () => {
    const { diagnostics, ses, cookies, webRequest } = fixture();
    diagnostics.observe(ses);
    expect(webRequest.onSendHeaders).toHaveBeenCalledOnce();
    const request = webRequest.onSendHeaders.mock.calls[0]![1];
    const redirect = webRequest.onBeforeRedirect.mock.calls[0]![1];
    request({
      id: 1,
      url: "https://github.com/private-repo?token=SECRET_QUERY",
      resourceType: "mainFrame",
      webContentsId: 5,
      requestHeaders: {
        Cookie: "user_session=SECRET_COOKIE; unrelated=SECRET_UNRELATED",
        Authorization: "Bearer SECRET_AUTH",
        "User-Agent": "Chrome/test",
      },
    });
    redirect({
      id: 1,
      url: "https://github.com/private-repo",
      redirectURL: "https://github.com/login?return_to=SECRET_RETURN",
      resourceType: "mainFrame",
      statusCode: 302,
    });
    cookies.emit(
      "changed",
      {},
      { name: "user_session", value: "SECRET_REMOVAL", domain: ".github.com", path: "/" },
      "expired",
      true,
    );
    await diagnostics.snapshot("resume");
    const state = diagnostics.getState();
    expect(state.entries).toContainEqual(
      expect.objectContaining({
        kind: "request",
        data: expect.objectContaining({
          requestId: 1,
          sentCookies: expect.objectContaining({ user_session: true, logged_in: false }),
        }),
      }),
    );
    expect(state.entries).toContainEqual(
      expect.objectContaining({
        kind: "redirect",
        data: { requestId: 1, status: 302, from: "github-page", to: "sign-in" },
      }),
    );
    expect(state.entries).toContainEqual(
      expect.objectContaining({
        kind: "cookie-changed",
        data: expect.objectContaining({ cause: "expired", removed: true }),
      }),
    );
    expect(state.entries).toContainEqual(
      expect.objectContaining({
        kind: "cookie-snapshot",
        data: expect.objectContaining({
          reason: "resume",
          cookies: [expect.objectContaining({ name: "user_session", expiresAt: 1900000000 })],
        }),
      }),
    );
    expect(JSON.stringify(state)).not.toMatch(/SECRET|private-repo|Authorization|unrelated/);
  });

  it("ignores other domains and subresources and bounds retained history", () => {
    const { diagnostics, cookies, webRequest } = fixture();
    const request = webRequest.onSendHeaders.mock.calls[0]![1];
    const before = diagnostics.getState().entries.length;
    cookies.emit(
      "changed",
      {},
      { name: "user_session", domain: "notgithub.com", value: "SECRET" },
      "explicit",
      true,
    );
    request({ id: 1, url: "https://github.com/api", resourceType: "xhr", requestHeaders: {} });
    request({
      id: 2,
      url: "https://github.com.evil.test/login",
      resourceType: "mainFrame",
      requestHeaders: {},
    });
    expect(diagnostics.getState().entries).toHaveLength(before);
    for (let i = 0; i < 600; i++)
      request({ id: i, url: "https://github.com/", resourceType: "mainFrame", requestHeaders: {} });
    expect(diagnostics.getState().entries).toHaveLength(500);
  });
});
