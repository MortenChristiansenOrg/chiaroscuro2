import type { Locator, Page } from "@playwright/test";
import type { AppSession } from "../automation/session";
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

async function openScripts(session: AppSession) {
  await new WindowChromePage(session.shell).domainCssButton.click();
  const section = session.shell.locator("#domain-settings-scripts");
  await expect(section.getByRole("heading", { name: "Scripts", exact: true })).toBeVisible();
  return section;
}

async function addScript(
  section: Locator,
  script: {
    name: string;
    source: string;
    runAt: "manual" | "page-load";
    pathPattern: string;
    alias: string;
    shortcut: string;
  },
) {
  await section.getByRole("button", { name: "Add script", exact: true }).click();
  const form = section.getByRole("form", { name: "New script", exact: true });
  await form.getByRole("textbox", { name: "Name", exact: true }).fill(script.name);
  await form.getByRole("combobox", { name: "Run", exact: true }).selectOption(script.runAt);
  await form.getByRole("textbox", { name: "Path pattern", exact: true }).fill(script.pathPattern);
  await form.getByRole("textbox", { name: "JavaScript", exact: true }).fill(script.source);
  if (script.runAt === "manual") {
    await form.getByRole("textbox", { name: "Alias (optional)", exact: true }).fill(script.alias);
    await form
      .getByRole("textbox", { name: "Shortcut (optional)", exact: true })
      .fill(script.shortcut);
  }
  await form.getByRole("button", { name: "Save script", exact: true }).click();
  const card = section.getByRole("article", { name: script.name, exact: true });
  await expect(card).toBeVisible();
  await expect(form).toHaveCount(0);
  return card;
}

async function editSource(section: Locator, name: string, source: string) {
  await section.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const form = section.getByRole("form", { name: `Edit ${name}`, exact: true });
  await form.getByRole("textbox", { name: "JavaScript", exact: true }).fill(source);
  await form.getByRole("button", { name: "Save script", exact: true }).click();
  await expect(form).toHaveCount(0);
}

async function selectTab(session: AppSession, url: string) {
  const target = await session.target((target) => target.kind === "tab" && target.url === url);
  await session.shell.locator(`[data-tab-id="${target.tabId}"]`).click();
  return session.page(target);
}

async function openPalette(session: AppSession) {
  await session.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((window) => !window.getParentWindow());
    if (!win) throw new Error("Missing browser window");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "T", modifiers: ["control"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "T", modifiers: ["control"] });
  });
  const page = await session.page(
    await session.target((target) => target.kind === "palette" && target.visible),
  );
  await expect(page.getByRole("textbox", { name: "Search or enter URL" })).toBeVisible();
  return page;
}

async function runAlias(session: AppSession, alias: string) {
  const palette = await openPalette(session);
  const input = palette.getByRole("textbox", { name: "Search or enter URL" });
  await input.fill(alias);
  await input.press("Enter");
}

async function sendShortcut(session: AppSession, page: Page) {
  const target = await session.target((target) => target.url === page.url() && target.visible);
  await session.app.evaluate(({ webContents, BrowserWindow }, id) => {
    if (id === null) throw new Error("Missing page WebContents ID");
    const content = webContents.fromId(id);
    if (!content) throw new Error("Missing script page");
    BrowserWindow.getAllWindows()
      .find((window) => !window.getParentWindow())
      ?.focus();
    content.focus();
    content.sendInputEvent({ type: "keyDown", keyCode: "Y", modifiers: ["control", "shift"] });
    content.sendInputEvent({ type: "keyUp", keyCode: "Y", modifiers: ["control", "shift"] });
  }, target.webContentsId);
}

// Observe a loaded page across rendering opportunities: an assertion immediately after
// navigation could pass before the main process's queued page-load script runs.
async function expectNoAutomaticChange(page: Page) {
  await page.waitForLoadState("load");
  const values = await page.evaluate(async () => {
    const observed: string[] = [];
    for (let frame = 0; frame < 20; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      observed.push(document.querySelector("#result")?.textContent ?? "missing output");
    }
    return observed;
  });
  expect(values).toEqual(Array.from({ length: 20 }, () => ""));
}

const automaticSource = `document.querySelector('#result').textContent = 'automatic ' + location.pathname;`;

test("website scripts UI manages automatic scripts with exact host/path scope and restart", async ({
  appSession: session,
}) => {
  test.setTimeout(120_000);
  const originalUrl = `${site.url}/scripts/initial`;
  await VerificationPage.navigate(session, originalUrl);
  let section = await openScripts(session);
  let card = await addScript(section, {
    name: "Automatic fixture",
    source: automaticSource,
    runAt: "page-load",
    pathPattern: "/scripts/*",
    alias: "",
    shortcut: "",
  });
  await expect(card.getByRole("switch", { name: "Enable Automatic fixture" })).toBeChecked();
  expect((await session.capture("domain-script-created")).status).toBe("complete");

  let page = await selectTab(session, originalUrl);
  // Saving an automatic script does not rewrite an already loaded document.
  await expect(page.locator("#result")).toHaveText("");
  await new WindowChromePage(session.shell).reloadButton.click();
  await expect(page.locator("#result")).toHaveText("automatic /scripts/initial");
  const matched = await VerificationPage.navigate(session, `${site.url}/scripts/next`);
  await expect(matched.result).toHaveText("automatic /scripts/next");

  const wrongPath = await VerificationPage.navigate(session, `${site.url}/unmatched`);
  await expectNoAutomaticChange(wrongPath.page);
  const wrongHost = await VerificationPage.navigate(
    session,
    `${site.url.replace("127.0.0.1", "localhost")}/scripts/unrelated-host`,
  );
  await expectNoAutomaticChange(wrongHost.page);
  // URL navigation can reuse the current unbookmarked tab. Restore the page
  // through the palette before restarting rather than assuming the old URL still exists.
  const restored = await VerificationPage.navigate(session, originalUrl);
  await expect(restored.result).toHaveText("automatic /scripts/initial");

  await session.restart();
  page = await selectTab(session, originalUrl);
  await expect(page.locator("#result")).toHaveText("automatic /scripts/initial");
  section = await openScripts(session);
  card = section.getByRole("article", { name: "Automatic fixture", exact: true });
  await expect(card.getByRole("switch")).toBeChecked();
  await editSource(
    section,
    "Automatic fixture",
    "document.querySelector('#result').textContent = 'edited automatic script';",
  );
  page = await selectTab(session, originalUrl);
  await new WindowChromePage(session.shell).reloadButton.click();
  await expect(page.locator("#result")).toHaveText("edited automatic script");
  section = await openScripts(session);
  card = section.getByRole("article", { name: "Automatic fixture", exact: true });
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).not.toBeChecked();
  page = await selectTab(session, originalUrl);
  await new WindowChromePage(session.shell).reloadButton.click();
  await expectNoAutomaticChange(page);
  section = await openScripts(session);
  card = section.getByRole("article", { name: "Automatic fixture", exact: true });
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toBeChecked();
  await card.getByRole("button", { name: "Delete Automatic fixture", exact: true }).click();
  await expect(card).toHaveCount(0);
  expect((await session.capture("domain-script-removed")).status).toBe("complete");
  await session.restart();
  page = await selectTab(session, originalUrl);
  await expectNoAutomaticChange(page);
});

test("website actions run from palette, alias and native shortcut with clipboard and errors", async ({
  appSession: session,
}) => {
  test.setTimeout(120_000);
  const url = `${site.url}/scripts/manual`;
  await VerificationPage.navigate(session, url);
  let section = await openScripts(session);
  await addScript(section, {
    name: "Copy fixture action",
    source: `await Promise.resolve();\nconst result = document.querySelector('#result');\nconst count = Number(result.textContent || 0) + 1;\nresult.textContent = String(count);\ncopy('fixture copied ' + count);`,
    runAt: "manual",
    pathPattern: "/scripts/*",
    alias: "/fixture-copy",
    shortcut: "Control+Shift+Y",
  });
  let page = await selectTab(session, url);
  await expect(page.locator("#result")).toHaveText("");
  const clipboardBefore = await session.app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    const palette = await openPalette(session);
    await palette.getByRole("textbox", { name: "Search or enter URL" }).fill("Copy fixture action");
    const action = palette.locator(".sg").filter({ hasText: "Copy fixture action" });
    await expect(action).toHaveCount(1);
    expect((await session.capture("domain-script-palette-action")).status).toBe("complete");
    await action.click();
    await expect(page.locator("#result")).toHaveText("1");
    await expect
      .poll(() => session.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("fixture copied 1");
    await runAlias(session, "/fixture-copy");
    await expect(page.locator("#result")).toHaveText("2");
    await sendShortcut(session, page);
    await expect(page.locator("#result")).toHaveText("3");
    await expect
      .poll(() => session.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("fixture copied 3");
    await session.restart();
    page = await selectTab(session, url);
    await expect(page.locator("#result")).toHaveText("");
    await sendShortcut(session, page);
    await expect(page.locator("#result")).toHaveText("1");

    section = await openScripts(session);
    await editSource(
      section,
      "Copy fixture action",
      "throw new Error('Intentional website script failure');",
    );
    page = await selectTab(session, url);
    const cursor = await session.eventCursor();
    await runAlias(session, "/fixture-copy");
    const failure = await session.waitForEvent("domain-scripts:executed", cursor);
    expect(failure.payload).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Intentional website script failure"),
    });
    const failedPalette = await session.page(
      await session.target((target) => target.kind === "palette" && target.visible),
    );
    await expect(failedPalette.getByRole("alert")).toContainText(
      "Intentional website script failure",
    );
    expect((await session.capture("domain-script-failure")).status).toBe("complete");
    await failedPalette.getByRole("textbox", { name: "Search or enter URL" }).press("Escape");
    await expect(page.getByRole("heading", { name: "Local verification page" })).toBeVisible();
    section = await openScripts(session);
    await expect(
      section.getByRole("article", { name: "Copy fixture action" }).getByRole("alert"),
    ).toContainText("Intentional website script failure");
  } finally {
    await session.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), clipboardBefore);
  }
});

test("website actions target the visible sub-tab and exclude unrelated pages", async ({
  appSession: session,
}) => {
  test.setTimeout(90_000);
  const url = `${site.url}/parent`;
  const parent = await VerificationPage.navigate(session, url);
  const section = await openScripts(session);
  await addScript(section, {
    name: "Mark visible fixture",
    source: "document.querySelector('#result').textContent = 'script target ' + location.pathname;",
    runAt: "manual",
    pathPattern: "/*",
    alias: "/fixture-target",
    shortcut: "",
  });
  await selectTab(session, url);
  const cursor = await session.eventCursor();
  await parent.subTab.click();
  await session.waitForEvent("sub-tabs:opened", cursor);
  const childTarget = await session.target(
    (target) => target.kind === "sub-tab" && target.url === `${site.url}/child` && target.visible,
  );
  const child = await session.page(childTarget);
  await runAlias(session, "/fixture-target");
  await expect(child.locator("#result")).toHaveText("script target /child");
  await expect(parent.result).toHaveText("");
  expect((await session.capture("domain-script-sub-tab-target")).status).toBe("complete");
  const frame = await session.page(
    await session.target((target) => target.kind === "sub-tab-frame"),
  );
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "visible parent after sub-tab removal",
    () => session.targets(),
    (targets) =>
      !targets.some((target) => target.id === childTarget.id) &&
      targets.some((target) => target.kind === "tab" && target.url === url && target.visible),
  );
  await runAlias(session, "/fixture-target");
  await expect(parent.result).toHaveText("script target /parent");

  await VerificationPage.navigate(session, `${site.url.replace("127.0.0.1", "localhost")}/parent`);
  const palette = await openPalette(session);
  await palette.getByRole("textbox", { name: "Search or enter URL" }).fill("Mark visible fixture");
  await expect(palette.locator(".sg").filter({ hasText: "Mark visible fixture" })).toHaveCount(0);
});
