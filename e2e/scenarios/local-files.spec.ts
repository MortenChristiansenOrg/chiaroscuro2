import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

test("local HTML links navigate to relative files and back", async ({ appSession: session }) => {
  const directory = path.join(session.profile, "local pages");
  await fs.mkdir(directory);
  await fs.writeFile(
    path.join(directory, "index.html"),
    '<h1>Local index</h1><a href="other%20page.html#section">Open other page</a>',
  );
  await fs.writeFile(
    path.join(directory, "other page.html"),
    '<h1 id="section">Linked local page</h1><a href="index.html">Return to index</a>',
  );
  const source = pathToFileURL(path.join(directory, "index.html")).href;
  const { page } = await VerificationPage.navigate(session, source);
  await page.getByRole("link", { name: "Open other page" }).click();
  await expect(page).toHaveURL(new URL("other%20page.html#section", source).href);
  await expect(page.getByRole("heading", { name: "Linked local page" })).toBeVisible();
  expect((await session.capture("linked-local-file")).status).toBe("complete");
  await page.getByRole("link", { name: "Return to index" }).click();
  await expect(page).toHaveURL(source);
  await expect(page.getByRole("heading", { name: "Local index" })).toBeVisible();
});
