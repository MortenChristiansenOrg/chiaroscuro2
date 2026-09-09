import type { DebugTarget } from "../../src/features/debug-server/targets.shared";
import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("same-origin tabs and sub-tabs keep independent zoom and shared sessions", async ({
  appSession: session,
}) => {
  test.setTimeout(60_000);
  const site = await startSite();
  const otherSite = await startSite();
  try {
    const first = await VerificationPage.navigate(session, `${site.url}/first`);
    const firstTarget = await session.target((t) => t.kind === "tab" && t.url.endsWith("/first"));
    const baseline = await first.page.evaluate(() => devicePixelRatio);
    await first.page.evaluate(() => {
      // biome-ignore lint/suspicious/noDocumentCookie: exercise shared page cookies
      document.cookie = "zoom-fixture=shared;path=/";
    });
    const key = async (target: DebugTarget, keyCode: string) => {
      await session.app.evaluate(
        ({ webContents }, { id, keyCode }) => {
          const wc = webContents.fromId(id);
          if (!wc) throw new Error("Missing target");
          wc.sendInputEvent({ type: "keyDown", keyCode, modifiers: ["control"] });
          wc.sendInputEvent({ type: "keyUp", keyCode, modifiers: ["control"] });
        },
        { id: target.webContentsId, keyCode },
      );
    };
    const level = (target: DebugTarget) =>
      session.app.evaluate(({ webContents }, id) => {
        const wc = webContents.fromId(id);
        if (!wc) throw new Error("Missing target");
        return wc.getZoomLevel();
      }, target.webContentsId);
    await first.message.click();
    await key(firstTarget, "=");
    await expect.poll(() => level(firstTarget)).toBe(1);
    await expect
      .poll(() => first.page.evaluate(() => devicePixelRatio))
      .toBeCloseTo(baseline * 1.2, 2);

    const second = await VerificationPage.navigate(session, `${site.url}/second`);
    const secondTarget = await session.target((t) => t.kind === "tab" && t.url.endsWith("/second"));
    expect(await second.page.evaluate(() => document.cookie)).toContain("zoom-fixture=shared");
    expect(await level(secondTarget)).toBe(0);
    await second.message.hover();
    const cursor = await session.eventCursor();
    await second.page.keyboard.down("Control");
    await second.page.mouse.wheel(0, -100);
    await second.page.keyboard.up("Control");
    expect((await session.waitForEvent("zoom:changed", cursor)).payload).toEqual({
      tabId: secondTarget.tabId,
      zoomLevel: 1,
    });
    await expect.poll(() => level(secondTarget)).toBe(1);
    expect(await level(firstTarget)).toBe(1);
    await key(secondTarget, "=");
    await expect.poll(() => level(secondTarget)).toBe(2);
    expect(await level(firstTarget)).toBe(1);

    await second.subTab.click();
    const childTarget = await session.target(
      (t) => t.kind === "sub-tab" && t.url.endsWith("/child"),
    );
    const child = new VerificationPage(await session.page(childTarget));
    await child.message.click();
    expect(await level(childTarget)).toBe(0);
    expect(await child.page.evaluate(() => document.cookie)).toContain("zoom-fixture=shared");
    await key(childTarget, "-");
    await expect.poll(() => level(childTarget)).toBe(-1);
    expect(await level(secondTarget)).toBe(2);
    await child.page.reload();
    await expect.poll(() => level(childTarget)).toBe(-1);
    const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
    const adoptedCursor = await session.eventCursor();
    await frame.getByRole("button", { name: "Open as tab", exact: true }).click();
    await session.waitForEvent("sub-tabs:promoted", adoptedCursor);
    await session.target((t) => t.kind === "tab" && t.tabId === childTarget.tabId);
    expect(await level(childTarget)).toBe(-1);
    await key(childTarget, "0");
    await expect.poll(() => level(childTarget)).toBe(0);
    await session.shell.locator(`[data-tab-id="${firstTarget.tabId}"]`).click();
    await expect.poll(() => level(firstTarget)).toBe(1);
    await first.page.goto(`${otherSite.url}/navigated`);
    await expect.poll(() => level(firstTarget)).toBe(1);
    await key(firstTarget, "0");
    await expect.poll(() => level(firstTarget)).toBe(0);
    expect(await level(secondTarget)).toBe(2);
    expect((await session.capture("isolated-zoom")).status).toBe("complete");
  } finally {
    await Promise.all([site.close(), otherSite.close()]);
  }
});
