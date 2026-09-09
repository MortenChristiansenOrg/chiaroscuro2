import fs from "node:fs/promises";
import path from "node:path";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
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

test("cross-window and sub-tab focus through visible UI", async ({ appSession: session }) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.submit("parent input");
  await expect(parent.result).toHaveText("parent input");
  const cursor = await session.eventCursor();
  await parent.subTab.click();
  await session.waitForEvent("sub-tabs:opened", cursor);
  const childTarget = await session.target(
    (target) => target.kind === "sub-tab" && target.url === `${site.url}/child` && target.visible,
  );
  expect(childTarget.parentId).toMatch(/^tab:/);
  const child = new VerificationPage(await session.page(childTarget));
  await child.submit("child input");
  await expect(child.result).toHaveText("child input");
  await child.message.click();
  await expect(child.message).toBeFocused();
  expect((await session.capture("sub-tab")).status).toBe("complete");
  const frame = await session.page(
    await session.target((target) => target.kind === "sub-tab-frame"),
  );
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "sub-tab removal",
    () => session.targets(),
    (targets) => !targets.some((target) => target.id === childTarget.id),
  );

  await parent.popup.click();
  const popupTarget = await session.target(
    (target) => target.kind === "window" && target.url === `${site.url}/popup`,
  );
  expect(popupTarget.parentId).toMatch(/^window:/);
  const popup = new VerificationPage(await session.page(popupTarget));
  await popup.submit("popup input");
  await expect(popup.result).toHaveText("popup input");
  expect((await session.capture("popup")).status).toBe("complete");
  await popup.page.close();
  await parent.message.click();
  await expect(parent.message).toBeFocused();
  await expect(parent.result).toHaveText("parent input");
});

test("PDF toolbar zoom survives a full process restart", async ({ appSession: session }) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/pdf-source`);
  await parent.pdf.click();
  const zoomIn = session.shell.getByRole("button", { name: "Zoom in", exact: true });
  const zoomReset = session.shell.getByRole("button", { name: "Reset zoom", exact: true });
  await expect(zoomReset).toHaveText("100%");
  await zoomIn.click();
  await expect(zoomReset).toHaveText("125%");
  await waitUntil(
    "PDF zoom command completion",
    () =>
      session.debug<{ entries: { name: string; error?: string }[] }>(
        "/history?name=pdf-reader:set-zoom",
      ),
    (history) => history.entries.some((entry) => !entry.error),
  );
  const oldPid = session.app.process().pid;
  const oldProfile = session.profile;
  await session.restart();
  expect(session.app.process().pid).not.toBe(oldPid);
  expect(session.profile).toBe(oldProfile);
  // Select the restored PDF in the sidebar, rather than reopening it through an internal command.
  const pdfTarget = await session.target(
    (target) => target.kind === "built-in" && target.url.startsWith("app:pdf-reader"),
  );
  await session.shell.locator(`[data-tab-id="${pdfTarget.tabId}"]`).click();
  await expect(session.shell.getByRole("button", { name: "Reset zoom", exact: true })).toHaveText(
    "125%",
  );
  await expect(session.shell.locator("canvas").first()).toBeVisible();
  expect((await session.capture("pdf-restored")).status).toBe("complete");
});

test("pointer resize, clipboard, file selection and deterministic download", async ({
  appSession: session,
}) => {
  const page = await VerificationPage.navigate(session, `${site.url}/interactions`);
  await session.command("permissions:set", {
    domain: "127.0.0.1",
    permission: "notifications",
    decision: "deny",
  });
  await page.page.getByRole("button", { name: "Request notification permission" }).click();
  await expect(page.page.locator("#permission-result")).toHaveText("denied");
  await page.upload.setInputFiles({
    name: "fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("local fixture"),
  });
  await expect(page.uploadedFile).toHaveText("fixture.txt");
  await page.scrollArea.hover();
  await page.page.mouse.wheel(0, 500);
  await expect
    .poll(() => page.scrollArea.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  const chrome = new WindowChromePage(session.shell);
  const clipboardBefore = await session.app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await chrome.copyUrlButton.click();
    await expect
      .poll(() => session.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(`${site.url}/interactions`);
  } finally {
    await session.app.evaluate(async ({ clipboard }, text) => {
      await clipboard.writeText(text);
    }, clipboardBefore);
  }

  const cursor = await session.eventCursor();
  await page.download.click();
  await session.waitForEvent("downloads:completed", cursor);
  expect(
    await fs.readFile(path.join(session.profile, "downloads", "verification.txt"), "utf8"),
  ).toBe("deterministic download\n");
  const separator = session.shell.getByRole("separator");
  const before = Number(await separator.getAttribute("aria-valuenow"));
  const bounds = await separator.boundingBox();
  if (!bounds) throw new Error("Sidebar resize handle has no bounds");
  await session.shell.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await session.shell.mouse.down();
  await session.shell.mouse.move(bounds.x + 60, bounds.y + bounds.height / 2, { steps: 12 });
  await session.shell.mouse.up();
  await expect
    .poll(async () => Number(await separator.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before + 40);
  await chrome.maximizeButton.click();
  await expect
    .poll(() =>
      session.debug<{ maximized: boolean }>("/state/window").then((state) => state.maximized),
    )
    .toBe(true);
  expect((await session.capture("interactions")).status).toBe("complete");
});

test("sidebar drag reorders real tabs and records animation frames", async ({
  appSession: session,
}) => {
  await VerificationPage.navigate(session, `${site.url}/drag-first`);
  await VerificationPage.navigate(session, `${site.url}/drag-second`);
  const tabs = session.shell.locator("nav[aria-label='Sidebar'] [data-tab-id]");
  await expect(tabs).toHaveCount(2);
  const firstId = await tabs.first().getAttribute("data-tab-id");
  const lastId = await tabs.last().getAttribute("data-tab-id");
  await session.recordFrames(
    await session.target((target) => target.kind === "shell"),
    "sidebar-drag",
    async () => {
      await tabs.last().dragTo(tabs.first(), { targetPosition: { x: 30, y: 2 } });
      await expect(tabs.first()).toHaveAttribute("data-tab-id", lastId ?? "missing");
      await expect(tabs.last()).toHaveAttribute("data-tab-id", firstId ?? "missing");
    },
  );
  expect((await session.capture("sidebar-reordered")).status).toBe("complete");
  const filmstrip = JSON.parse(
    await fs.readFile(path.join(session.artifactDir, "sidebar-drag.frames.json"), "utf8"),
  );
  expect(filmstrip.frames.length).toBeGreaterThan(0);
});

test("intentional failure produces reproducible evidence", async ({ appSession: session }) => {
  await VerificationPage.navigate(session, `${site.url}/evidence`);
  let failure = "";
  try {
    await waitUntil(
      "intentional missing tab",
      () => session.targets(),
      (targets) => targets.some((target) => target.id === "tab:intentionally-missing"),
      200,
    );
  } catch (error) {
    failure = String(error);
    expect((await session.capture("intentional-failure")).status).toBe("complete");
  }
  expect(failure).toContain("intentional missing tab");
  await session.writeJson("intentional-failure.result.json", {
    status: "failed",
    expected: true,
    error: failure,
    rerun: "bun run verify:app --grep 'intentional failure'",
  });
  const files = await fs.readdir(session.artifactDir);
  expect(files).toContain("intentional-failure.targets.json");
  expect(files).toContain("intentional-failure.state.json");
  expect(files.some((file) => file.endsWith("renderer.png"))).toBe(true);
  const unauthenticated = await fetch(`${session.debugUrl}/state`);
  expect(unauthenticated.status).toBe(401);
  const browserOrigin = await fetch(`${session.debugUrl}/state`, {
    headers: { Origin: site.url, Authorization: `Bearer ${session.token}` },
  });
  expect(browserOrigin.status).toBe(403);
});
