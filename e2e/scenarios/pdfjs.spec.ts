import fs from "node:fs/promises";
import path from "node:path";
import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("PDF.js opens legacy engine preferences with selectable text, search and index", async ({
  appSession: session,
}) => {
  test.setTimeout(60_000);
  const site = await startSite();
  try {
    await session.stop();
    const settingsPath = path.join(session.profile, "settings.json");
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8").catch(() => "{}"));
    await fs.writeFile(settingsPath, JSON.stringify({ ...settings, "pdf-backend": "mupdf" }));
    await session.launch();
    await session.command("settings:open");
    await expect(session.shell.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(session.shell.getByText("PDF Rendering Backend", { exact: true })).toHaveCount(0);
    await session.capture("settings-without-engine-selector");

    const parent = await VerificationPage.navigate(session, `${site.url}/pdfjs`);
    await parent.pdf.click();
    await expect(session.shell.locator("canvas").first()).toBeVisible();
    const text = session.shell.getByText("Chiaroscuro verification PDF", { exact: true });
    await expect(text).toBeVisible();
    await text.click({ clickCount: 3 });
    await expect
      .poll(() => session.shell.evaluate(() => window.getSelection()?.toString()))
      .toContain("Chiaroscuro verification PDF");
    const clipboardBefore = await session.app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      await session.shell.keyboard.press("Control+c");
      await expect
        .poll(() => session.app.evaluate(({ clipboard }) => clipboard.readText()))
        .toContain("Chiaroscuro verification PDF");
    } finally {
      await session.app.evaluate(
        ({ clipboard }, value) => clipboard.writeText(value),
        clipboardBefore,
      );
    }
    await session.shell.getByRole("textbox", { name: "Search in PDF" }).fill("verification");
    await session.shell.getByRole("textbox", { name: "Search in PDF" }).press("Enter");
    await expect(session.shell.getByText("1 / 1", { exact: true })).toBeVisible();
    await expect(session.shell.getByText("Fixture outline", { exact: true })).toBeVisible();
    await session.shell.getByRole("button", { name: "Add index entry" }).click();
    await session.shell.getByPlaceholder("Entry label").fill("Saved fixture index");
    await session.shell.getByPlaceholder("Entry label").press("Enter");
    await expect(session.shell.getByText("Saved fixture index", { exact: true })).toBeVisible();
    await session.shell.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(session.shell.getByRole("button", { name: "Reset zoom", exact: true })).toHaveText(
      "125%",
    );
    expect((await session.capture("pdfjs-search-index")).status).toBe("complete");
  } finally {
    await site.close();
  }
});
