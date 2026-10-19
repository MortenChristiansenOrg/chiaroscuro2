import fs from "node:fs/promises";
import path from "node:path";
import { startSite } from "../automation/site";
import { waitForNewDocument, waitUntil } from "../automation/wait";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";
import { WindowChromePage } from "../pages/window-chrome.page";

let site: Awaited<ReturnType<typeof startSite>>;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

test("domain CSS is applied again after reloads that race tab updates and leaks nothing", async ({
  appSession: session,
}) => {
  test.setTimeout(120_000);
  // Domain CSS must apply even where the page's CSP forbids styles.
  const url = `${site.url}/strict-csp`;
  const { page } = await VerificationPage.navigate(session, url);
  const heading = page.locator("h1");
  // The settings UI saves CSS through the system editor or AI; write the file it would save.
  await fs.mkdir(path.join(session.profile, "domain-css"), { recursive: true });
  await fs.writeFile(
    path.join(session.profile, "domain-css", "127.0.0.1.css"),
    "h1 { color: rgb(180, 30, 70); }",
  );
  await session.command("domain-css:toggle", { domain: "127.0.0.1" });
  await expect(heading).toHaveCSS("color", "rgb(180, 30, 70)");

  // Every tab update re-applies domain CSS. Spread updates across each reload so some
  // CSS calls reach the page while its new document commits, as busy sessions do.
  const target = await session.target((item) => item.kind === "tab" && item.url === url);
  await session.app.evaluate(
    ({ webContents }, { contentsId, tabId }) => {
      const bus = (
        globalThis as unknown as {
          __testHooks: { commandBus: { send(name: string, payload: unknown): Promise<unknown> } };
        }
      ).__testHooks.commandBus;
      let reloads = 0;
      webContents.fromId(contentsId)?.on("did-start-loading", () => {
        setTimeout(() => void bus.send("tabs:activate", { tabId }), reloads++ % 25);
      });
    },
    { contentsId: target.webContentsId, tabId: target.tabId },
  );
  const reload = new WindowChromePage(session.shell).reloadButton;
  for (let attempt = 1; attempt <= 25; attempt++) {
    await waitForNewDocument(page, () => reload.click());
    await expect(heading, `reload ${attempt}`).toHaveCSS("color", "rgb(180, 30, 70)");
  }
  await session.command("domain-css:toggle", { domain: "127.0.0.1" });
  await expect(heading).not.toHaveCSS("color", "rgb(180, 30, 70)");

  // A CSS call lost to a reload must not keep the closed tab's WebContents alive.
  await session.app.evaluate(({ webContents }, contentsId) => {
    const contents = webContents.fromId(contentsId);
    if (!contents) throw new Error("Tab contents missing");
    Object.assign(globalThis, { __closedTabContents: new WeakRef(contents) });
  }, target.webContentsId);
  await session.command("tabs:close", { tabId: target.tabId });
  await waitUntil(
    "the closed tab's WebContents to be garbage collected",
    () =>
      session.app.evaluate(async () => {
        process.getBuiltinModule("v8").setFlagsFromString("--expose-gc");
        const collect = process.getBuiltinModule("vm").runInNewContext("gc") as () => void;
        collect();
        // A WeakRef keeps its target alive until the current job ends.
        await new Promise((resolve) => setTimeout(resolve));
        collect();
        const ref = (globalThis as unknown as { __closedTabContents: WeakRef<object> })
          .__closedTabContents;
        return ref.deref() === undefined;
      }),
    (collected) => collected,
    10_000,
  );
});
