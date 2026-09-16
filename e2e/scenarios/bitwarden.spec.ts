import { createHash, createHmac, X509Certificate } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { AppSession } from "../automation/session";
import { BitwardenPopupPage } from "../pages/bitwarden-popup.page";

// Opt-in acceptance against a disposable local Vaultwarden account. Never use a personal vault.
const extensionDirectory = process.env.BITWARDEN_TEST_EXTENSION;
const previousDirectory = process.env.BITWARDEN_TEST_PREVIOUS_EXTENSION;
const certificate = process.env.BITWARDEN_TEST_CERT;
const email = "extension-test@example.test";
const password = "Disposable extension test password 2026!";
function totp() {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const mac = createHmac("sha1", Buffer.from("12345678901234567890")).update(counter).digest();
  return String((mac.readUInt32BE((mac[19] ?? 0) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
test("official Bitwarden password lifecycle", async ({ playwright: _playwright }, info) => {
  test.skip(
    !extensionDirectory || !certificate,
    "Set BITWARDEN_TEST_EXTENSION and BITWARDEN_TEST_CERT for the disposable local fixture.",
  );
  test.setTimeout(120_000);
  if (!extensionDirectory || !certificate) return;
  const spki = createHash("sha256")
    .update(
      new X509Certificate(await fs.readFile(certificate)).publicKey.export({
        type: "spki",
        format: "der",
      }),
    )
    .digest("base64");
  const app = new AppSession(
    info.outputPath("bitwarden"),
    [`--ignore-certificate-errors-spki-list=${spki}`],
    true,
  );
  const id = "nngceckbapebfimnlniiiahkandclblb";
  let popup: Page | undefined;
  const openPopup = async () => {
    if (popup && !popup.isClosed()) await popup.close();
    const toggle = app.shell.getByRole("button", { name: "Extensions", exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await app.shell.getByRole("button", { name: "Bitwarden", exact: true }).click();
    popup = await app.page(
      await app.target(
        (target) => target.url.startsWith("chrome-extension:") && target.url.includes("/popup/"),
      ),
    );
    return popup;
  };
  try {
    app.profile = await fs.mkdtemp(path.join(os.tmpdir(), "chiaroscuro-verify-bitwarden-"));
    const initialDirectory = previousDirectory ?? extensionDirectory;
    await fs.cp(initialDirectory, path.join(app.profile, "chromium/extensions", id), {
      recursive: true,
    });
    const manifest = JSON.parse(
      await fs.readFile(path.join(initialDirectory, "manifest.json"), "utf8"),
    );
    await fs.writeFile(
      path.join(app.profile, "settings.json"),
      JSON.stringify({
        extensions: [
          {
            id,
            name: "Bitwarden",
            version: manifest.version,
            enabled: true,
            permissions: [
              ...manifest.permissions,
              ...manifest.host_permissions,
              ...manifest.content_scripts.flatMap(
                (script: { matches: string[] }) => script.matches,
              ),
            ],
          },
        ],
      }),
    );
    await app.launch();
    await app.command("tabs:create", { url: "http://127.0.0.1:18328/alpha" });
    popup = await openPopup();
    await new BitwardenPopupPage(popup).login(
      email,
      password,
      "https://localhost:18329",
      process.env.BITWARDEN_TEST_TOTP === "1" ? totp : undefined,
    );
    await new BitwardenPopupPage(popup).waitForItem("Fixture Alpha");
    if (previousDirectory) {
      const identity = new URL(popup.url()).hostname;
      const current = JSON.parse(
        await fs.readFile(path.join(extensionDirectory, "manifest.json"), "utf8"),
      );
      await popup.close();
      await app.command("extensions:open");
      const card = app.shell.getByRole("article", { name: "Bitwarden", exact: true });
      await card.getByRole("button", { name: "Check now", exact: true }).click();
      await card
        .getByRole("button", { name: "Approve permissions", exact: true })
        .waitFor({ timeout: 60_000 });
      await card.getByRole("button", { name: "Approve permissions", exact: true }).click();
      await expect(card).toContainText(`Update ready · Version ${current.version}`);
      await app.restart();
      await app.command("extensions:open");
      await expect(
        app.shell.getByRole("article", { name: "Bitwarden", exact: true }),
      ).toContainText(`v${current.version} · Enabled`);
      await app.command("tabs:create", { url: "http://127.0.0.1:18328/alpha?upgrade" });
      popup = undefined;
      popup = await openPopup();
      expect(new URL(popup.url()).hostname).toBe(identity);
      await new BitwardenPopupPage(popup).unlock(password);
      await new BitwardenPopupPage(popup).waitForItem("Fixture Alpha");
    }

    const vault = new BitwardenPopupPage(popup);
    const updatedPassword = `alpha-updated-${Date.now()}`;
    await vault.editPassword("Fixture Alpha", "alpha-user", updatedPassword);
    expect((await vault.generatePassword()).length).toBeGreaterThanOrEqual(14);
    await vault.createLogin(
      `Acceptance ${Date.now()}`,
      "created-user",
      "created-disposable-password",
      "https://example.test",
    );
    // Switching tabs resets Bitwarden's popup route cache to its vault view.
    for (const [url, name, user, secret, embedded] of [
      [
        "http://127.0.0.1:18328/alpha?updated",
        "Fixture Alpha",
        "alpha-user",
        updatedPassword,
        false,
      ],
      ["http://127.0.0.1:18328/iframe", "Fixture Alpha", "alpha-user", updatedPassword, true],
      ["http://localhost:18328/beta", "Fixture Beta", "beta-user", "beta-fake-password", false],
    ] as const) {
      await app.command("tabs:create", { url });
      const page = await app.page(await app.target((target) => target.url === url));
      popup = await openPopup();
      await new BitwardenPopupPage(popup).fill(name);
      const form = embedded ? page.frameLocator("iframe") : page;
      await expect(form.getByLabel("Username")).toHaveValue(user);
      await expect(form.getByLabel("Password", { exact: true })).toHaveValue(secret);
    }
    await app.command("tabs:create", { url: "http://127.0.0.2:18328/unmatched" });
    popup = await openPopup();
    await new BitwardenPopupPage(popup).waitForVault();
    await expect(new BitwardenPopupPage(popup).fixtureSuggestions).toHaveCount(0);
    await app.restart();
    popup = undefined;
    await app.command("tabs:create", { url: "http://localhost:18328/beta?restart" });
    popup = await openPopup();
    await new BitwardenPopupPage(popup).unlock(password);
    await new BitwardenPopupPage(popup).fill("Fixture Beta");
    const restored = await app.page(
      await app.target((target) => target.url === "http://localhost:18328/beta?restart"),
    );
    await expect(restored.getByLabel("Password", { exact: true })).toHaveValue(
      "beta-fake-password",
    );
  } finally {
    await app.close();
  }
});
