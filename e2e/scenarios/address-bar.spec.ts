import { startSite } from "../automation/site";
import { windowsPointer } from "../automation/windows-pointer";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";
import { WindowChromePage } from "../pages/window-chrome.page";

test("Windows address-bar native clicks in restored and maximized windows", async ({
  appSession: session,
}) => {
  test.skip(process.platform !== "win32", "Requires Windows desktop hit testing");
  test.setTimeout(300_000);
  const chrome = new WindowChromePage(session.shell);
  const before = await session.app.evaluate(({ clipboard }) => clipboard.readText());
  const site = await startSite();
  try {
    for (const maximized of [false, true]) {
      if (maximized)
        await session.app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()
            .find((w) => !w.getParentWindow())
            ?.maximize();
        });
      for (const name of ["Reload", "Copy URL", "Domain customization"]) {
        for (const part of ["icon", "padding"]) {
          await test.step(
            `${maximized ? "maximized" : "restored"}: ${name} ${part}`,
            async () => {
              const url = `${site.url}/address-bar`;
              await VerificationPage.navigate(session, url);
              // Opening and closing Find must remove its native drag region as well as its UI.
              await session.command("find:start");
              const input = chrome.findInput;
              await expect(input).toBeFocused();
              await input.press("Escape");
              await expect(input).toHaveCount(0);
              const button = chrome.addressBarButton(name);
              const box = await (part === "icon" ? button.locator("i") : button).boundingBox();
              if (!box) throw new Error("Missing button geometry");
              const point = {
                x: box.x + (part === "icon" ? box.width / 2 : 2),
                y: box.y + box.height / 2,
              };
              const native = await windowsPointer(session, point);
              expect(native.hitTest).toBe(1);
              await expect
                .poll(() => button.evaluate((element) => element.matches(":hover")))
                .toBe(true);
              const cursor = await session.eventCursor();
              await windowsPointer(session, point, true);
              const command =
                name === "Reload"
                  ? "window:reload"
                  : name === "Copy URL"
                    ? "window:copy-address"
                    : "domain-settings:open";
              await expect
                .poll(async () => {
                  const history = await session.debug<{
                    entries: { id: number; error?: string }[];
                  }>(`/history?type=command&name=${command}`);
                  return history.entries.some((entry) => entry.id > cursor && !entry.error);
                })
                .toBe(true);
              if (name === "Copy URL")
                expect(await session.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
                  url,
                );
            },
            { timeout: 60_000 },
          );
        }
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
