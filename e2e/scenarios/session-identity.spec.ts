import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("first and subsequent tabs, sub-tabs and OAuth popups share a stable browser identity", async ({
  appSession: session,
}) => {
  test.setTimeout(60_000);
  const userAgents = new Map<string, string | undefined>();
  const site = await startSite((request) =>
    userAgents.set(request.url ?? "", request.headers["user-agent"]),
  );
  try {
    const first = await VerificationPage.navigate(session, `${site.url}/identity-first`);
    const expected = await first.page.evaluate(() => navigator.userAgent);
    expect(expected).toContain("Chrome/");
    expect(expected).not.toMatch(/Electron|chiaroscuro/i);
    expect(userAgents.get("/identity-first")).toBe(expected);
    const target = await session.target(
      (t) => t.kind === "tab" && t.url.endsWith("/identity-first"),
    );
    await session.app.evaluate(
      async ({ webContents }, { id, url }) => {
        const ses = webContents.fromId(id)!.session;
        await ses.cookies.set({
          url,
          name: "persistent-identity-fixture",
          value: "survives-restart",
          expirationDate: Date.now() / 1000 + 86400,
        });
        await ses.cookies.set({
          url: "https://github.com",
          name: "user_session",
          value: "DO_NOT_LOG_AUTH_SENTINEL",
          httpOnly: true,
          secure: true,
          expirationDate: Date.now() / 1000 + 86400,
        });
        await ses.cookies.flushStore();
      },
      { id: target.webContentsId, url: site.url },
    );
    const second = await VerificationPage.navigate(session, `${site.url}/identity-second`);
    expect(await second.page.evaluate(() => navigator.userAgent)).toBe(expected);
    expect(userAgents.get("/identity-second")).toBe(expected);
    await second.subTab.click();
    const childTarget = await session.target(
      (t) => t.kind === "sub-tab" && t.url.endsWith("/child"),
    );
    const child = await session.page(childTarget);
    expect(await child.evaluate(() => navigator.userAgent)).toBe(expected);
    expect(userAgents.get("/child")).toBe(expected);
    const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
    const cursor = await session.eventCursor();
    await frame.getByRole("button", { name: "Close sub-tab" }).click();
    await session.waitForEvent("sub-tabs:closed", cursor);
    await second.popup.click();
    const popup = await session.page(
      await session.target((t) => t.kind === "window" && t.url.endsWith("/popup")),
    );
    expect(await popup.evaluate(() => navigator.userAgent)).toBe(expected);
    expect(userAgents.get("/popup")).toBe(expected);
    await popup.close();
    await session.restart();
    const restarted = await VerificationPage.navigate(session, `${site.url}/identity-restarted`);
    expect(await restarted.page.evaluate(() => navigator.userAgent)).toBe(expected);
    expect(userAgents.get("/identity-restarted")).toBe(expected);
    expect(await restarted.page.evaluate(() => document.cookie)).toContain(
      "persistent-identity-fixture=survives-restart",
    );
    const diagnostics = await session.debug<{ entries: { kind: string; data: unknown }[] }>(
      "/state/github-session",
    );
    expect(diagnostics.entries).toContainEqual(
      expect.objectContaining({
        kind: "session-ready",
        data: expect.objectContaining({ userAgent: expected, persistent: true }),
      }),
    );
    expect(diagnostics.entries).toContainEqual(
      expect.objectContaining({
        kind: "cookie-snapshot",
        data: expect.objectContaining({
          cookies: [expect.objectContaining({ name: "user_session", httpOnly: true })],
        }),
      }),
    );
    expect(JSON.stringify(diagnostics)).not.toMatch(/survives-restart|DO_NOT_LOG_AUTH_SENTINEL/);
  } finally {
    await site.close();
  }
});
