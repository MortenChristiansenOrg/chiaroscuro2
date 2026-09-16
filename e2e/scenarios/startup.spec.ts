import fs from "node:fs/promises";
import path from "node:path";
import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";

test("restored tabs create native views on demand and keep extension inventories complete", async ({
  appSession: session,
}) => {
  test.setTimeout(60_000);
  const site = await startSite();
  try {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await session.command<string>("tabs:create", {
        url: `${site.url}/parent?tab=${i}`,
      });
      ids.push(id);
      await session.command("tabs:toggle-bookmark", { tabId: id });
    }
    await session.stop();
    const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const extensionDir = path.join(session.profile, "chromium/extensions", extensionId);
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.writeFile(
      path.join(extensionDir, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Dormant tab fixture",
        version: "1.0.0",
        permissions: ["tabs"],
        action: { default_popup: "popup.html" },
      }),
    );
    await fs.writeFile(
      path.join(extensionDir, "popup.html"),
      "<!doctype html><title>Tab inventory</title>",
    );
    const settingsPath = path.join(session.profile, "settings.json");
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    settings.extensions = [
      {
        id: extensionId,
        name: "Dormant tab fixture",
        version: "1.0.0",
        enabled: false,
        permissions: ["tabs"],
      },
    ];
    await fs.writeFile(settingsPath, JSON.stringify(settings));
    await session.launch();
    const nativeTabs = async () => (await session.targets()).filter((t) => t.kind === "tab");
    expect(await nativeTabs()).toHaveLength(1);
    expect((await nativeTabs())[0]?.tabId).toBe(ids[4]);

    // UI activation must construct the view and deliver navigation/title events.
    await session.shell.locator(`[data-tab-id="${ids[0]}"]`).click();
    const activated = await session.target((t) => t.tabId === ids[0] && t.url.includes("tab=0"));
    await expect(
      (await session.page(activated)).getByLabel("Message", { exact: true }),
    ).toBeVisible();
    expect(await nativeTabs()).toHaveLength(2);

    // Closing an unvisited tab must not construct it or leave it persisted.
    await session.command("tabs:close", { tabId: ids[1] });
    expect(await nativeTabs()).toHaveLength(2);
    await expect(session.shell.locator(`[data-tab-id="${ids[1]}"]`)).toHaveCount(0);

    // A duplicate of an unvisited tab still has its source URL and shared session.
    const duplicate = await session.command<string>("tabs:duplicate", { tabId: ids[2] });
    const copy = await session.target((t) => t.tabId === duplicate && t.url.includes("tab=2"));
    await expect((await session.page(copy)).getByLabel("Message", { exact: true })).toBeVisible();
    expect(await nativeTabs()).toHaveLength(4);

    // Extensions depend on native tab IDs. Loading one materializes remaining
    // dormant tabs before its worker starts, preserving the existing API contract.
    await session.command("extensions:set-enabled", { extensionId, enabled: true });
    expect(await nativeTabs()).toHaveLength(5);
    expect((await nativeTabs()).some((t) => t.tabId === ids[1])).toBe(false);
    expect((await session.capture("restored-tabs")).status).toBe("complete");
  } finally {
    await site.close();
  }
});
