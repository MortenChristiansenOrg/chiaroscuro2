import { startSite } from "../automation/site";
import { windowsPointer } from "../automation/windows-pointer";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("Windows address-bar native clicks in restored and maximized windows", async ({
  appSession: session,
}) => {
  test.skip(process.platform !== "win32", "Requires Windows desktop hit testing");
  test.setTimeout(60_000);
  const site = await startSite();
  const before = await session.app.evaluate(({ clipboard }) => clipboard.readText());
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
          const url = `${site.url}/address-bar`;
          await VerificationPage.navigate(session, url);
          // Opening and closing Find must remove its native drag region as well as its UI.
          await session.command("find:start");
          const input = session.shell.getByPlaceholder("Find in page");
          await expect(input).toBeFocused();
          await input.press("Escape");
          await expect(input).toHaveCount(0);
          const button = session.shell.getByRole("button", {
            name,
            exact: true,
          });
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
            expect(await session.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(url);
        }
      }
    }
  } finally {
    await session.app.evaluate(({ clipboard }, value) => clipboard.writeText(value), before);
    await site.close();
  }
});
