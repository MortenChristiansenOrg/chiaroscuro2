import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
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

async function dropFiles(page: Page, files: string[], x = 200, y = 200): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const data = { items: [], files, dragOperationsMask: 1 };
    for (const type of ["dragEnter", "dragOver", "drop"] as const) {
      await cdp.send("Input.dispatchDragEvent", { type, x, y, data });
    }
  } finally {
    await cdp.detach();
  }
}

test("native file drops open documents from shell and tabs without replacing the source", async ({
  appSession: session,
}) => {
  const file = path.join(session.profile, "dropped # document.html");
  await fs.writeFile(file, "<h1>Dropped document</h1>");
  const sourceFile = path.join(session.profile, "source.html");
  await fs.writeFile(sourceFile, "<h1>Drop source</h1>");
  const source = await VerificationPage.navigate(session, pathToFileURL(sourceFile).href);
  const sourceUrl = source.page.url();
  await dropFiles(source.page, [file]);
  const dropped = await session.page(
    await session.target(
      (target) => target.kind === "tab" && target.url === pathToFileURL(file).href,
    ),
  );
  await expect(dropped.getByRole("heading", { name: "Dropped document" })).toBeVisible();
  expect(source.page.url()).toBe(sourceUrl);
  const second = path.join(session.profile, "shell document.html");
  await fs.writeFile(second, "<h1>Shell document</h1>");
  await dropFiles(session.shell, [second], 100, 200);
  const shellDrop = await session.page(
    await session.target(
      (target) => target.kind === "tab" && target.url === pathToFileURL(second).href,
    ),
  );
  await expect(shellDrop.getByRole("heading", { name: "Shell document" })).toBeVisible();
  expect((await session.capture("file-drops")).status).toBe("complete");
});

for (const target of ["document", "window"] as const) {
  test(`${target} upload handlers keep supported file drops`, async ({ appSession: session }) => {
    const file = path.join(session.profile, "upload.html");
    await fs.writeFile(file, "<h1>Upload only</h1>");
    const { page } = await VerificationPage.navigate(session, pathToFileURL(file).href);
    await page.evaluate((target) => {
      (target === "document" ? document : window).addEventListener("drop", (event) => {
        if (!(event instanceof DragEvent)) return;
        event.preventDefault();
        document.body.textContent = `Uploaded ${event.dataTransfer?.files[0]?.name}`;
      });
    }, target);
    await dropFiles(page, [file]);
    await expect(page.getByText("Uploaded upload.html")).toBeVisible();
    expect(
      (await session.targets()).filter(
        (target) => target.kind === "tab" && target.url === pathToFileURL(file).href,
      ),
    ).toHaveLength(1);
  });
}
