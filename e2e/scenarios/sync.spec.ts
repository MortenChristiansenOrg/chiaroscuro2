import { FAKE_APP_DATA_KEY } from "../../src/test-utils/fake-app-data-service";
import { startAppDataService } from "../automation/app-data-service";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

let site: Awaited<ReturnType<typeof startSite>>;
let service: Awaited<ReturnType<typeof startAppDataService>>;
test.beforeAll(async () => {
  site = await startSite();
  service = await startAppDataService({ maxValueBytes: 4096 });
});
test.afterAll(async () => {
  await site.close();
  await service.close();
});

const navigation = {
  blockNavigate: { enabled: false, crossOriginOnly: false },
  blockRedirect: { enabled: false, crossOriginOnly: false },
  blockFrameNavigate: { enabled: false, crossOriginOnly: false },
  blockNewTabs: false,
  blockNewWindows: false,
};

test("sync connects in Settings, applies another machine's CSS and uploads local changes", async ({
  appSession: session,
}) => {
  test.setTimeout(120_000);
  // Xvfb has no system keyring; stand in for it so the key can be saved.
  await session.app.evaluate(() => {
    const protection = (
      globalThis as unknown as {
        __testHooks: {
          syncProtection: {
            encrypt(value: string): Uint8Array;
            decrypt(value: Uint8Array): string;
          };
        };
      }
    ).__testHooks.syncProtection;
    protection.encrypt = (value) => Buffer.from(value, "utf8");
    protection.decrypt = (value) => Buffer.from(value).toString("utf8");
  });
  service.write("domains", "127.0.0.1", {
    schemaVersion: 1,
    domain: "127.0.0.1",
    css: "h1 { color: rgb(20, 110, 60); }",
    enabled: true,
    navigation,
  });
  const { page } = await VerificationPage.navigate(session, `${site.url}/strict-csp`);

  await session.command("settings:open", undefined);
  const sync = session.shell.locator("#settings-sync");
  await sync.getByLabel("Service URL").fill(service.url);
  await sync.getByLabel("Key for this machine").fill(FAKE_APP_DATA_KEY);
  await sync.getByRole("button", { name: "Connect" }).click();
  await expect(sync.getByRole("status")).toHaveText(/^Last synced /);
  await expect(sync.getByText(`Connected to ${service.url}`)).toBeVisible();
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(20, 110, 60)");

  // Turning the CSS off here reaches the service shortly after.
  await session.command("domain-css:toggle", { domain: "127.0.0.1" });
  await waitUntil(
    "domain CSS change uploaded",
    async () => service.value("domains", "127.0.0.1") as { enabled?: boolean } | undefined,
    (value) => value?.enabled === false,
  );

  // A script the service refuses as too large stays here and is explained.
  await session.command("domain-scripts:save", {
    script: {
      id: "big-script",
      domain: "127.0.0.1",
      name: "Big script",
      source: `// ${"x".repeat(5000)}`,
      enabled: true,
      runAt: "manual",
      pathPattern: "/*",
      alias: "",
      shortcut: "",
    },
  });
  const issues = sync.getByRole("list", { name: "Items that didn't sync" });
  await expect(issues).toContainText("Script “Big script” on 127.0.0.1");
  await expect(issues).toContainText("JSON values are limited to 4096 bytes.");
  expect(service.value("scripts", "big-script")).toBeUndefined();
  await sync.scrollIntoViewIfNeeded();
  await session.capture("sync-settings-connected");

  await sync.getByRole("button", { name: "Disconnect" }).click();
  await expect(sync.getByLabel("Service URL")).toBeVisible();
  await session.capture("sync-settings-disconnected");
});
