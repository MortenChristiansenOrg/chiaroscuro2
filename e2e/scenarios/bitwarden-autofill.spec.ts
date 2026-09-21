import { createHash, createHmac, X509Certificate } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { AppSession } from "../automation/session";
import { BitwardenPopupPage } from "../pages/bitwarden-popup.page";

// Opt-in acceptance against a disposable local Vaultwarden account. Never use a personal vault.
const extensionDirectory = process.env.BITWARDEN_TEST_EXTENSION;
const certificate = process.env.BITWARDEN_TEST_CERT;
const email = "extension-test@example.test";
const password = "Disposable extension test password 2026!";
/** Generate the disposable fixture account's RFC test authenticator code. */
function totp() {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const mac = createHmac("sha1", Buffer.from("12345678901234567890")).update(counter).digest();
  return String((mac.readUInt32BE((mac[19] ?? 0) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
/** Observe the autofill settling window so empty-field checks cannot race a delayed fill. */
async function remainsValue(field: Locator, expected = "") {
  const until = Date.now() + 2_000;
  let supplied = false;
  await expect
    .poll(
      async () => {
        supplied ||= (await field.inputValue()) !== expected;
        return !supplied && Date.now() >= until;
      },
      { timeout: 4_000, message: "The form value must remain stable" },
    )
    .toBe(true);
}

/** Select the official closed-shadow menu through visible input, retaining screenshot evidence. */
async function fillInline(page: Page, username: Locator, screenshot: string) {
  await username.click();
  await expect.poll(() => page.frames().some((f) => f.url().includes("menu-list.html"))).toBe(true);
  const list = page.frames().find((f) => f.url().includes("menu-list.html"));
  if (!list) throw new Error("Missing inline menu");
  // Bitwarden renders its sandboxed menu inside a closed shadow root.
  // Use visible pointer input below the focused field and verify the resulting fill.
  await expect(list.locator("autofill-inline-menu-list")).toBeVisible();
  await page.screenshot({ path: screenshot });
  const field = await username.boundingBox();
  if (!field) throw new Error("Missing username field");
  await page.mouse.click(field.x + 55, field.y + field.height + 24);
}

test("official Bitwarden inline and automatic autofill", async ({
  playwright: _playwright,
}, info) => {
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
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    const form =
      '<form><label>Username<input autocomplete="username" name="username"></label><label>Password<input type="password" autocomplete="current-password" name="password"></label></form>';
    const content = request.url?.startsWith("/iframe")
      ? '<iframe src="/alpha" style="width:700px;height:400px"></iframe>'
      : request.url?.startsWith("/cross")
        ? `<iframe src="http://localhost:${(server.address() as { port: number }).port}/beta" style="width:700px;height:400px"></iframe>`
        : form;
    response.end(
      `<!doctype html><title>Disposable login</title><style>input{display:block;width:250px;margin-bottom:12px}</style>${content}`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const port = (server.address() as { port: number }).port;
  const alphaUrl = `http://127.0.0.1:${port}/alpha`;
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
    const initialDirectory = extensionDirectory;
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
    await app.command("tabs:create", { url: alphaUrl });
    popup = await openPopup();
    await new BitwardenPopupPage(popup).login(
      email,
      password,
      "https://localhost:18329",
      process.env.BITWARDEN_TEST_TOTP === "1" ? totp : undefined,
    );
    await new BitwardenPopupPage(popup).waitForItem("Fixture Alpha");
    await popup.getByRole("link", { name: /^Settings/ }).click();
    await popup.getByText("Autofill", { exact: true }).click();
    await popup
      .getByRole("checkbox", { name: "Show autofill suggestions on form fields", exact: true })
      .check();

    await popup.close();
    const page = await app.page(await app.target((t) => t.url === alphaUrl));
    await fillInline(page, page.getByLabel("Username"), info.outputPath("inline.png"));
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("alpha-fake-password");
    // Bitwarden finishes its fill animation asynchronously; keep the filled document alive
    // until stable before navigating to the embedded form.
    await remainsValue(page.getByLabel("Password", { exact: true }), "alpha-fake-password");
    await page.goto(`http://127.0.0.1:${port}/iframe?inline`);
    const embedded = page.frameLocator("iframe");
    await remainsValue(embedded.getByLabel("Password", { exact: true }));
    await fillInline(page, embedded.getByLabel("Username"), info.outputPath("inline-embedded.png"));
    await expect(embedded.getByLabel("Password", { exact: true })).toHaveValue(
      "alpha-fake-password",
    );
    await page.goto(alphaUrl);
    await page.reload();
    await remainsValue(page.getByLabel("Password", { exact: true }));
    await page.getByLabel("Username").click();
    await app.app.evaluate(
      ({ webContents, BrowserWindow }, id) => {
        if (id === null) throw new Error("Missing target ID");
        const wc = webContents.fromId(id);
        if (!wc) throw new Error("Missing target contents");
        const win = BrowserWindow.getAllWindows().find((window) => !window.getParentWindow());
        win?.focus();
        wc.focus();
        wc.sendInputEvent({ type: "keyDown", keyCode: "L", modifiers: ["control", "shift"] });
        wc.sendInputEvent({ type: "keyUp", keyCode: "L", modifiers: ["control", "shift"] });
      },
      (await app.target((t) => t.url === page.url())).webContentsId,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("alpha-fake-password");
    popup = await openPopup();
    await popup.getByRole("checkbox", { name: "Autofill on page load", exact: true }).check();
    await popup.getByRole("combobox", { name: "Default autofill setting for login items" }).click();
    await popup.getByRole("option", { name: "Autofill on page load", exact: true }).click();
    await popup.close();
    for (const [host, route, secret] of [
      ["127.0.0.1", "/alpha?automatic", "alpha-fake-password"],
      ["127.0.0.1", "/iframe", "alpha-fake-password"],
      ["localhost", "/beta", "beta-fake-password"],
    ] as const) {
      const url = `http://${host}:${port}${route}`;
      await app.command("tabs:create", { url });
      const loaded = await app.page(await app.target((t) => t.url === url));
      const form = route === "/iframe" ? loaded.frameLocator("iframe") : loaded;
      await expect(form.getByLabel("Password", { exact: true })).toHaveValue(secret, {
        timeout: 15000,
      });
    }
    const crossUrl = `http://127.0.0.1:${port}/cross`;
    await app.command("tabs:create", { url: crossUrl });
    const crossPage = await app.page(await app.target((t) => t.url === crossUrl));
    await expect(
      crossPage.frameLocator("iframe").getByLabel("Password", { exact: true }),
    ).toBeVisible();
    await remainsValue(crossPage.frameLocator("iframe").getByLabel("Password", { exact: true }));
    // An unrelated host must never receive either fixture credential.
    const unmatchedUrl = `http://127.0.0.2:${port}/unmatched`;
    await app.command("tabs:create", { url: unmatchedUrl });
    const unmatched = await app.page(await app.target((t) => t.url === unmatchedUrl));
    await remainsValue(unmatched.getByLabel("Password", { exact: true }));
    await app.restart();
    popup = undefined;
    await app.command("tabs:create", { url: alphaUrl });
    const locked = await app.page(await app.target((t) => t.url === alphaUrl));
    await remainsValue(locked.getByLabel("Password", { exact: true }));
    await locked.getByLabel("Username").click();
    await app.app.evaluate(
      ({ webContents, BrowserWindow }, id) => {
        if (id === null) throw new Error("Missing target ID");
        const wc = webContents.fromId(id);
        if (!wc) throw new Error("Missing target contents");
        const win = BrowserWindow.getAllWindows().find((window) => !window.getParentWindow());
        win?.focus();
        wc.focus();
        wc.sendInputEvent({ type: "keyDown", keyCode: "L", modifiers: ["control", "shift"] });
        wc.sendInputEvent({ type: "keyUp", keyCode: "L", modifiers: ["control", "shift"] });
      },
      (await app.target((t) => t.url === alphaUrl)).webContentsId,
    );
    const unlockPopup = await app.page(
      await app.target((t) => t.url.startsWith("chrome-extension:") && t.url.includes("/popup/")),
    );
    await expect(unlockPopup.getByLabel("Master password", { exact: false })).toBeVisible();
    await remainsValue(locked.getByLabel("Password", { exact: true }));
    await new BitwardenPopupPage(unlockPopup).unlock(password);
    await new BitwardenPopupPage(unlockPopup).waitForItem("Fixture Alpha");
    await unlockPopup.close();
    await locked.reload();
    await expect(locked.getByLabel("Password", { exact: true })).toHaveValue(
      "alpha-fake-password",
      { timeout: 15000 },
    );
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
