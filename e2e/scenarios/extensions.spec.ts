import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { unpackedExtensionId } from "../../src/platform/extension-identity";
import { AppSession } from "../automation/session";

test("MV3 worker observes vault state, fills the active tab and retains only durable state on restart", async ({
  playwright: _playwright,
}, testInfo) => {
  test.setTimeout(60_000);
  const app = new AppSession(testInfo.outputPath("app"), [], true);
  const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<!doctype html><title>Extension fixture</title><label>Username<input id="username"></label><label>Password<input id="password" type="password"></label>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture listener");
  const base = `http://127.0.0.1:${address.port}`;
  const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const workerReady = async (popup: Page) => {
    const ready = await popup.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          chrome: { runtime: { sendMessage(message: unknown): Promise<unknown> } };
        }
      ).chrome;
      return api.runtime.sendMessage({ ready: true });
    });
    expect(ready).toBe("ready");
  };

  try {
    app.profile = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-verify-extensions-"));
    await fs.cp(
      path.resolve("e2e/fixtures/extension"),
      path.join(app.profile, "chromium/extensions", extensionId),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(app.profile, "settings.json"),
      JSON.stringify({
        extensions: [
          {
            id: extensionId,
            name: "Compatibility fixture",
            version: "1.0.0",
            enabled: true,
            permissions: ["storage", "tabs", "scripting", "webNavigation", "http://127.0.0.1/*"],
          },
        ],
      }),
    );
    const restrictedId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const restrictedDir = path.join(app.profile, "chromium/extensions", restrictedId);
    await fs.mkdir(restrictedDir);
    await fs.writeFile(
      path.join(restrictedDir, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Restricted fixture",
        version: "1.0.0",
        permissions: ["storage"],
        action: { default_popup: "popup.html" },
      }),
    );
    await fs.writeFile(
      path.join(restrictedDir, "popup.html"),
      "<!doctype html><title>Restricted fixture</title><p>Permission check</p>",
    );
    await fs.writeFile(
      path.join(app.profile, "settings.json"),
      JSON.stringify({
        extensions: [
          {
            id: extensionId,
            name: "Compatibility fixture",
            version: "1.0.0",
            enabled: true,
            permissions: ["storage", "tabs", "scripting", "webNavigation", "http://127.0.0.1/*"],
          },
          {
            id: restrictedId,
            name: "Restricted fixture",
            version: "1.0.0",
            enabled: true,
            permissions: ["storage"],
          },
        ],
      }),
    );
    await app.launch();
    // Subscribe before creating the tab whose activation event is under test.
    // Native extension loading can resolve before an MV3 worker finishes startup.
    await app.command("extensions:open-popup", { extensionId });
    const initialPopup = await app.page(
      await app.target(
        (target) =>
          target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
      ),
    );
    await workerReady(initialPopup);
    await initialPopup.close();
    const fill = async (name: string, count: number) => {
      await app.command("tabs:create", { url: `${base}/${name}` });
      const tab = await app.target((target) => target.url === `${base}/${name}`);
      const page = await app.page(tab);
      expect(await page.evaluate(() => "__chiaroscuroExtensionBrowser" in globalThis)).toBe(false);
      const toggle = app.shell.getByRole("button", { name: "Extensions", exact: true });
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await app.shell.getByRole("button", { name: "Compatibility fixture", exact: true }).click();
      const popup = await app.page(
        await app.target(
          (target) =>
            target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
        ),
      );
      expect(new URL(popup.url()).hostname).toBe(
        unpackedExtensionId(path.join(app.profile, "chromium/extensions", extensionId)),
      );
      const contexts = await popup.evaluate(async () => {
        const api = (
          globalThis as unknown as {
            chrome: {
              runtime: {
                getContexts(
                  filter: unknown,
                ): Promise<{ contextType: string; documentUrl?: string }[]>;
              };
            };
          }
        ).chrome;
        return api.runtime.getContexts({ contextTypes: ["POPUP"] });
      });
      expect(contexts).toHaveLength(1);
      expect(contexts[0]?.documentUrl).toBe(popup.url());
      const nativeError = await popup.evaluate(
        () =>
          new Promise<string | undefined>((resolve) => {
            const api = (
              globalThis as unknown as {
                chrome: {
                  tabs: { sendMessage(id: number, message: unknown, callback: () => void): void };
                  runtime: { lastError?: { message: string } };
                };
              }
            ).chrome;
            api.tabs.sendMessage(2147483647, {}, () => resolve(api.runtime.lastError?.message));
          }),
      );
      expect(nativeError).toBeTruthy();
      await popup.getByRole("button", { name: "Unlock and fill fixture" }).click();
      await expect(popup.locator("#result")).toHaveText(
        JSON.stringify({
          tabId: tab.webContentsId,
          activeTabId: tab.webContentsId,
          fills: count,
          frames: 1,
        }),
      );
      await expect(page.getByLabel("Username")).toHaveValue(name);
      await expect(page.getByLabel("Password")).toHaveValue("fixture-only");
      await popup.close();
      return page;
    };
    const first = await fill("first", 1);
    await fill("second", 2);
    await expect(first.getByLabel("Username")).toHaveValue("first");
    await app.command("extensions:open-popup", { extensionId: restrictedId });
    const restricted = await app.page(
      await app.target(
        (target) =>
          target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
      ),
    );
    const permissions = await restricted.evaluate(async () => {
      const bridge = (
        globalThis as unknown as {
          __chiaroscuroExtensionBrowser: {
            invoke(method: string, args: unknown[]): Promise<{ ok: boolean; value?: unknown }>;
          };
        }
      ).__chiaroscuroExtensionBrowser;
      return {
        tabs: await bridge.invoke("tabs.query", [{}]),
        navigation: await bridge.invoke("webNavigation.getAllFrames", [{ tabId: 1 }]),
      };
    });
    expect(permissions.navigation.ok).toBe(false);
    expect(permissions.tabs.ok).toBe(true);
    for (const tab of permissions.tabs.value as Record<string, unknown>[]) {
      expect(tab).not.toHaveProperty("url");
      expect(tab).not.toHaveProperty("title");
    }
    await restricted.close();
    await app.restart();
    await app.command("extensions:open-popup", { extensionId });
    const popup = await app.page(
      await app.target(
        (target) =>
          target.url.startsWith("chrome-extension:") && target.url.endsWith("/popup.html"),
      ),
    );
    await workerReady(popup);
    const state = await popup.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          chrome: {
            storage: {
              session: { get(keys: string): Promise<Record<string, unknown>> };
              local: { get(keys: string): Promise<Record<string, unknown>> };
            };
          };
        }
      ).chrome;
      return {
        session: await api.storage.session.get("unlock"),
        local: await api.storage.local.get("fills"),
      };
    });
    expect(state).toEqual({ session: {}, local: { fills: 2 } });
    await popup.close();
    await fill("restarted", 3);
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
