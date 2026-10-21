import { startSite } from "../automation/site";
import { windowsHitTests, windowsPointer } from "../automation/windows-pointer";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";
import { WindowChromePage } from "../pages/window-chrome.page";

const HTCLIENT = 1;
const HTCAPTION = 2;

test("Windows top-bar native clicks in restored and maximized windows", async ({
  appSession: session,
}) => {
  test.skip(process.platform !== "win32", "Requires Windows desktop hit testing");
  test.setTimeout(420_000);
  const chrome = new WindowChromePage(session.shell);
  const before = await session.app.evaluate(({ clipboard }) => clipboard.readText());
  const site = await startSite();
  try {
    // Geometry is measured once per step; the URL pill's crossfade must not move it later.
    await session.shell.emulateMedia({ reducedMotion: "reduce" });
    // A site's own app-region must not drag the browser window (#51).
    const dragUrl = `${site.url}/app-region`;
    await VerificationPage.navigate(session, dragUrl);
    const tab = await session.target((target) => target.kind === "tab" && target.visible);
    const page = await session.page(tab);
    const header = await page.locator("header").boundingBox();
    const shadow = await page.locator("#shadow-host").evaluate((host) => {
      const r = host.shadowRoot?.firstElementChild?.getBoundingClientRect();
      return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const viewport =
      page.viewportSize() ??
      (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
    if (!header || !shadow || !tab.bounds) throw new Error("Missing page geometry");
    const { x: left, y: top } = tab.bounds;
    const toShell = ({ x, y }: { x: number; y: number }) => ({ x: left + x, y: top + y });
    const pageHits = await windowsHitTests(session, [
      toShell({ x: header.x + header.width - 20, y: header.y + 20 }),
      toShell(shadow),
    ]);
    expect.soft(pageHits, "page app-region in the active tab").toEqual([HTCLIENT, HTCLIENT]);
    // A modal dialog's ::backdrop is a box of its own, outside every element.
    await page.locator("dialog").evaluate((dialog: HTMLDialogElement) => dialog.showModal());
    const backdropHits = await windowsHitTests(session, [
      toShell({ x: 20, y: viewport.height - 20 }),
    ]);
    expect.soft(backdropHits, "page ::backdrop app-region").toEqual([HTCLIENT]);
    await page.locator("dialog").evaluate((dialog: HTMLDialogElement) => dialog.close());
    // Electron's clone() drops the preload; a duplicate must suppress the page's regions too.
    const duplicate = await session.command<string>("tabs:duplicate", { tabId: tab.tabId });
    const copy = await session.page(
      await session.target((target) => target.tabId === duplicate && target.url === dragUrl),
    );
    await expect(copy.locator("header")).toBeAttached();

    for (const maximized of [false, true]) {
      if (maximized)
        await session.app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()
            .find((w) => !w.getParentWindow())
            ?.maximize();
        });
      for (const part of ["content", "padding"] as const) {
        await test.step(
          `${maximized ? "maximized" : "restored"}: ${part}`,
          async () => {
            // Each new tab leaves the app-region page behind as a hidden tab, which Electron
            // still hit-tests at the window's origin, under the top bar.
            const url = `${site.url}/top-bar`;
            await VerificationPage.navigate(session, url);
            // Opening and closing Find must remove its native drag region as well as its UI.
            await session.command("find:start");
            await expect(chrome.findInput).toBeFocused();
            await chrome.findInput.press("Escape");
            await expect(chrome.findInput).toHaveCount(0);
            await session.command("zoom:in");
            await expect(chrome.zoomIndicator).toBeVisible();

            const { controls, empty } = await chrome.hitTargets();
            for (const name of ["Reload", "Copy URL", "Domain customization", "Minimize", "Close"])
              expect(controls.map((control) => control.name)).toContain(name);
            expect(empty.length).toBeGreaterThan(10);
            const hits = await windowsHitTests(session, [
              ...controls.map((control) => control[part]),
              ...empty,
            ]);
            expect(
              controls.map((control, i) => `${control.name}: ${hits[i]}`),
              "every top-bar control is client area",
            ).toEqual(controls.map((control) => `${control.name}: ${HTCLIENT}`));
            expect(
              hits.slice(controls.length).filter((hit) => hit !== HTCAPTION),
              "empty top-bar space drags the window",
            ).toEqual([]);

            // Desktop clicks reach the controls; Domain customization leaves the page, so it is last.
            const clicks = [
              { button: chrome.addressBarButton("Reload"), command: "window:reload" },
              { button: chrome.addressBarButton("Copy URL"), command: "window:copy-address" },
              { button: chrome.zoomIndicator, command: "zoom:reset" },
              {
                button: chrome.addressBarButton("Domain customization"),
                command: "domain-settings:open",
              },
            ];
            for (const { button, command } of clicks) {
              const name = await button.getAttribute("aria-label");
              const point = controls.find((control) => control.name === name)?.[part];
              if (!point) throw new Error(`Missing ${name} geometry`);
              const native = await windowsPointer(session, point);
              expect(native.hitTest, `${name} ${part}`).toBe(HTCLIENT);
              await expect
                .poll(() => button.evaluate((element) => element.matches(":hover")))
                .toBe(true);
              const cursor = await session.eventCursor();
              await windowsPointer(session, point, true);
              await expect
                .poll(async () => {
                  const history = await session.debug<{
                    entries: { id: number; error?: string }[];
                  }>(`/history?type=command&name=${command}`);
                  return history.entries.some((entry) => entry.id > cursor && !entry.error);
                })
                .toBe(true);
              if (command === "window:copy-address")
                expect(await session.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
                  url,
                );
            }
          },
          { timeout: 120_000 },
        );
      }
    }
  } finally {
    try {
      await session.app.evaluate(({ clipboard }, value) => clipboard.writeText(value), before);
    } finally {
      await site.close();
    }
  }
});
