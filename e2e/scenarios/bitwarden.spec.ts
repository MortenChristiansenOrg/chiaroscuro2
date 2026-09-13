import { createHash, createHmac, X509Certificate } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { AppSession } from "../automation/session";

// Opt-in acceptance against a disposable local Vaultwarden account. Never use a personal vault.
const extensionDirectory = process.env.BITWARDEN_TEST_EXTENSION;
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
    await fs.cp(extensionDirectory, path.join(app.profile, "chromium/extensions", id), {
      recursive: true,
    });
    const manifest = JSON.parse(
      await fs.readFile(path.join(extensionDirectory, "manifest.json"), "utf8"),
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
    await popup.getByRole("button", { name: "Log in", exact: true }).click();
    await popup.getByRole("button", { name: "bitwarden.com", exact: true }).click();
    await popup.getByRole("menuitem", { name: "self-hosted", exact: true }).click();
    await popup
      .getByRole("textbox", { name: "Server URL", exact: true })
      .fill("https://localhost:18329");
    await popup.getByRole("button", { name: "Save", exact: true }).click();
    await popup.getByRole("textbox", { name: /Email address/ }).fill(email);
    await popup.getByRole("button", { name: "Continue", exact: true }).click();
    await popup.getByLabel("Master password", { exact: false }).fill(password);
    await popup.getByRole("button", { name: "Log in", exact: true }).click();
    if (process.env.BITWARDEN_TEST_TOTP === "1") {
      await popup.getByRole("textbox", { name: /Verification code/ }).fill(totp());
      await popup.getByRole("button", { name: "Continue logging in", exact: true }).click();
    }
    await popup.getByText("Fixture Alpha", { exact: true }).first().waitFor({ timeout: 20_000 });
    await popup
      .getByRole("button", { name: "View item - Fixture Alpha - alpha-user", exact: true })
      .first()
      .click();
    const updatedPassword = `alpha-updated-${Date.now()}`;
    await popup.getByRole("button", { name: "Edit", exact: true }).click();
    await popup.getByRole("textbox", { name: "Password", exact: true }).fill(updatedPassword);
    await popup.getByRole("button", { name: "Save", exact: true }).click();
    await popup.getByRole("heading", { name: "View Login", exact: true }).waitFor();
    await popup.getByRole("button", { name: "Back", exact: true }).click();
    await popup.getByRole("link", { name: "Generator", exact: true }).click();
    await popup.getByRole("button", { name: "Generate password", exact: true }).click();
    expect((await popup.locator("code").allTextContents()).join("").length).toBeGreaterThanOrEqual(
      14,
    );
    await popup.getByRole("link", { name: "Vault", exact: true }).click();
    await popup.getByRole("button", { name: /New$/ }).click();
    await popup.getByRole("menuitem", { name: "Login", exact: true }).click();
    const createdName = `Acceptance ${Date.now()}`;
    await popup.getByRole("textbox", { name: /^Item name/ }).fill(createdName);
    await popup.getByRole("textbox", { name: "Username", exact: true }).fill("created-user");
    await popup
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("created-disposable-password");
    await popup
      .getByRole("textbox", { name: "Website (URI)", exact: true })
      .fill("https://example.test");
    await popup.getByRole("button", { name: "Save", exact: true }).click();
    await popup.getByRole("heading", { name: createdName, exact: true }).waitFor();
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
      await popup.getByRole("button", { name: `Autofill - ${name}`, exact: true }).click();
      const form = embedded ? page.frameLocator("iframe") : page;
      await expect(form.getByLabel("Username")).toHaveValue(user);
      await expect(form.getByLabel("Password", { exact: true })).toHaveValue(secret);
    }
    await app.command("tabs:create", { url: "http://127.0.0.2:18328/unmatched" });
    popup = await openPopup();
    await popup.getByRole("heading", { name: "Vault", exact: true }).waitFor();
    await expect(popup.getByRole("button", { name: /^Autofill - Fixture/ })).toHaveCount(0);
    await app.restart();
    popup = undefined;
    await app.command("tabs:create", { url: "http://localhost:18328/beta?restart" });
    popup = await openPopup();
    await popup.getByLabel("Master password", { exact: false }).fill(password);
    await popup.getByRole("button", { name: "Unlock", exact: true }).click();
    await popup.getByRole("button", { name: "Autofill - Fixture Beta", exact: true }).click();
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
