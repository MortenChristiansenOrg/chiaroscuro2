import {
  answerLeavePrompts,
  leavePrompts,
  leavePromptsShown,
  warnBeforeUnload,
} from "../automation/leave-prompt";
import type { AppSession } from "../automation/session";
import { startSite } from "../automation/site";
import { waitUntil } from "../automation/wait";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

let site: Awaited<ReturnType<typeof startSite>>;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

const leavePrompt = (page: string) => ({
  title: `Verification /${page}`,
  message: "Leave this page?",
});

/** Open a tab with changes typed into it that it warns about before unloading. */
async function unsavedTab(session: AppSession, page: string) {
  const tab = await VerificationPage.navigate(session, `${site.url}/${page}`);
  await tab.submit(`unsaved ${page}`);
  await warnBeforeUnload(tab.page);
  const target = await session.target((t) => t.kind === "tab" && t.url.endsWith(`/${page}`));
  return { tab, row: session.shell.locator(`[data-tab-id="${target.tabId}"]`) };
}

/** Answer every remaining prompt with Leave, so the session can quit when the test ends. */
const leaveAll = (session: AppSession) => answerLeavePrompts(session.app, Array(8).fill(true));

const quit = (session: AppSession) => session.app.evaluate(({ app }) => app.quit());

const tabPaths = async (session: AppSession) =>
  (await session.targets()).filter((t) => t.kind === "tab").map((t) => new URL(t.url).pathname);

// Regression for #117: closing such a tab silently did nothing.
test("closing a tab with unsaved changes asks before leaving it", async ({
  appSession: session,
}) => {
  const { tab, row } = await unsavedTab(session, "form");

  await answerLeavePrompts(session.app, [false]);
  await row.hover();
  await row.getByRole("button", { name: "Close tab", exact: true }).click();
  await expect.poll(() => leavePrompts(session.app)).toEqual([leavePrompt("form")]);
  // Staying keeps the tab and what was typed into it.
  await expect(row).toHaveCount(1);
  await expect(tab.message).toHaveValue("unsaved form");

  await answerLeavePrompts(session.app, [true]);
  await row.hover();
  await row.getByRole("button", { name: "Close tab", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await leavePrompts(session.app)).toEqual([leavePrompt("form")]);
  await waitUntil(
    "left tab destroyed",
    () => session.targets(),
    (targets) => !targets.some((t) => t.url.endsWith("/form")),
  );
});

test("clearing tabs asks once per page with unsaved changes and keeps the ones you stay on", async ({
  appSession: session,
}) => {
  const kept = await unsavedTab(session, "kept");
  const left = await unsavedTab(session, "left");
  await VerificationPage.navigate(session, `${site.url}/saved`);

  await answerLeavePrompts(session.app, [false, true]);
  await expect(session.command("tabs:clear-ephemeral", {})).rejects.toThrow(
    "Page prevented closing",
  );
  expect(await leavePrompts(session.app)).toEqual([leavePrompt("kept"), leavePrompt("left")]);
  await expect(kept.row).toHaveCount(1);
  await expect(kept.tab.message).toHaveValue("unsaved kept");
  await expect(left.row).toHaveCount(0);
  const targets = await session.targets();
  expect(targets.filter((t) => t.kind === "tab").map((t) => new URL(t.url).pathname)).toEqual([
    "/kept",
  ]);
  await leaveAll(session);
});

// #121: quitting asks about every page with unsaved changes, as Chrome does.
test("quitting asks about each page with unsaved changes and staying keeps every tab", async ({
  appSession: session,
}) => {
  await VerificationPage.navigate(session, `${site.url}/saved`);
  const saved = await session.target((t) => t.kind === "tab" && t.url.endsWith("/saved"));
  const savedRow = session.shell.locator(`[data-tab-id="${saved.tabId}"]`);
  const first = await unsavedTab(session, "first");
  const second = await unsavedTab(session, "second");

  // The shown page is asked about first, then the others, newest first. Leaving it closes its
  // page; staying on the next cancels the quit before the remaining pages are touched.
  await answerLeavePrompts(session.app, [true, false]);
  await quit(session);
  await expect
    .poll(() => leavePrompts(session.app))
    .toEqual([leavePrompt("second"), leavePrompt("first")]);
  await expect(first.row).toHaveCount(1);
  await expect(second.row).toHaveCount(1);
  await expect(savedRow).toHaveCount(1);
  // The page the user stayed on is shown with what was typed into it.
  await session.target((t) => t.kind === "tab" && t.url.endsWith("/first") && t.visible);
  await expect(first.tab.message).toHaveValue("unsaved first");
  expect((await tabPaths(session)).sort()).toEqual(["/first", "/saved"]);

  // The tab whose page closed while asking loads again when shown.
  await second.row.click();
  const reloaded = new VerificationPage(
    await session.page(
      await session.target((t) => t.kind === "tab" && t.url.endsWith("/second") && t.visible),
    ),
  );
  await expect(reloaded.message).toHaveValue("");

  // Leaving quits, and every tab comes back next session.
  const tabIds = await Promise.all(
    [first.row, savedRow, second.row].map((row) => row.getAttribute("data-tab-id")),
  );
  await answerLeavePrompts(session.app, [true]);
  const prompts: string[] = [];
  session.app.process().stdout?.on("data", (chunk: Buffer) => {
    if (chunk.toString().includes("leave-prompt-shown")) prompts.push("shown");
  });
  await session.app.evaluate(({ dialog }) => {
    const answer = dialog.showMessageBoxSync;
    dialog.showMessageBoxSync = ((...args: Parameters<typeof answer>) => {
      console.log("leave-prompt-shown");
      return answer(...args);
    }) as typeof answer;
  });
  // AppSession.stop fails if Electron does not exit within its shutdown deadline.
  await session.stop();
  expect(prompts).toEqual(["shown"]);
  await session.launch();
  for (const tabId of tabIds) {
    await expect(session.shell.locator(`[data-tab-id="${tabId}"]`)).toHaveCount(1);
  }
});

// #140: like Chrome, quitting shows each page before asking about it, and the prompt names it.
test("quitting shows each page with unsaved changes before asking about it, even in another workspace", async ({
  appSession: session,
}) => {
  // Two drafts of the same form have the same title; their addresses tell them apart.
  const first = await unsavedTab(session, "form?draft=1");
  const home = (await session.debug<{ activeWorkspaceId: string }>("/state/workspaces"))
    .activeWorkspaceId;
  const personal = await session.command<string>("workspaces:create", {
    name: "Personal",
    color: "#cc6677",
    icon: "P",
  });
  await session.command("workspaces:switch", { workspaceId: personal });
  await unsavedTab(session, "form?draft=2");
  await VerificationPage.navigate(session, `${site.url}/saved`);

  const asked = (page: string) => ({
    title: "Verification /form",
    message: "Leave this page?",
    detail: `Verification /form\n${new URL(site.url).host}/${page}\n\nChanges you made may not be saved.`,
    // Only the page asked about is visible behind its prompt.
    shown: [`${site.url}/${page}`],
  });
  await answerLeavePrompts(session.app, [true, false]);
  await quit(session);
  await expect
    .poll(() => leavePromptsShown(session.app))
    .toEqual([asked("form?draft=2"), asked("form?draft=1")]);

  // The page the user stayed on stays shown, in its own workspace.
  await session.target((t) => t.kind === "tab" && t.url.endsWith("draft=1") && t.visible);
  await expect(first.tab.message).toHaveValue("unsaved form?draft=1");
  expect(
    (await session.debug<{ activeWorkspaceId: string }>("/state/workspaces")).activeWorkspaceId,
  ).toBe(home);
  await leaveAll(session);
});

test("closing the browser window asks about unsaved changes and staying keeps it", async ({
  appSession: session,
}) => {
  const { tab, row } = await unsavedTab(session, "form");
  const closeWindow = () =>
    session.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => !win.getParentWindow())
        ?.close(),
    );

  await answerLeavePrompts(session.app, [false]);
  await closeWindow();
  await expect.poll(() => leavePrompts(session.app)).toEqual([leavePrompt("form")]);
  await expect(row).toHaveCount(1);
  await expect(tab.message).toHaveValue("unsaved form");
  expect(await tabPaths(session)).toEqual(["/form"]);
  await leaveAll(session);
});

test("quitting asks about a sub-tab first and pages closed while asking come back", async ({
  appSession: session,
}) => {
  const other = await unsavedTab(session, "other");
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const target = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const child = new VerificationPage(await session.page(target));
  await child.submit("unsaved child");
  await warnBeforeUnload(child.page);

  // Staying on the sub-tab on top keeps everything, including the tab beneath it.
  await answerLeavePrompts(session.app, [false]);
  await quit(session);
  await expect.poll(() => leavePrompts(session.app)).toEqual([leavePrompt("child")]);
  await session.target((t) => t.id === target.id && t.visible);
  await expect(child.message).toHaveValue("unsaved child");
  expect((await tabPaths(session)).sort()).toEqual(["/other", "/parent"]);

  // Leaving the sub-tab closes it and the tab beneath; the other tab is shown before asking.
  await answerLeavePrompts(session.app, [true, false]);
  await quit(session);
  await expect
    .poll(() => leavePrompts(session.app))
    .toEqual([leavePrompt("child"), leavePrompt("other")]);
  const shown = (await leavePromptsShown(session.app)).map((prompt) =>
    prompt.shown.map((url) => new URL(url).pathname).sort(),
  );
  expect(shown).toEqual([["/child", "/parent"], ["/other"]]);
  await session.target((t) => t.kind === "tab" && t.url.endsWith("/other") && t.visible);
  await expect(other.tab.message).toHaveValue("unsaved other");
  expect(await tabPaths(session)).toEqual(["/other"]);

  // Returning to the parent loads it and its sub-tab again.
  const parentRow = session.shell.locator(
    `[data-tab-id="${target.parentId?.replace(/^tab:/, "")}"]`,
  );
  await parentRow.click();
  await session.target((t) => t.kind === "tab" && t.url.endsWith("/parent") && t.visible);
  const reloaded = await session.target(
    (t) => t.kind === "sub-tab" && t.url.endsWith("/child") && t.visible,
  );
  expect(reloaded.tabId).toBe(target.tabId);
  await leaveAll(session);
});

test("quitting asks about a pop-up before the page that opened it", async ({
  appSession: session,
}) => {
  const opener = await unsavedTab(session, "opener");
  // Closing the opener would destroy the pop-up without asking.
  await opener.tab.page.evaluate((url) => {
    window.open(url, "verification-popup", "popup,width=480,height=360");
  }, `${site.url}/popup`);
  const popupTarget = await session.target((t) => t.kind === "window" && t.url.endsWith("/popup"));
  const popup = new VerificationPage(await session.page(popupTarget));
  await popup.submit("unsaved popup");
  await warnBeforeUnload(popup.page);

  await answerLeavePrompts(session.app, [false]);
  await quit(session);
  await expect.poll(() => leavePrompts(session.app)).toEqual([leavePrompt("popup")]);
  // The pop-up is shown while it is asked about.
  expect((await leavePromptsShown(session.app))[0]?.shown).toContain(`${site.url}/popup`);
  // Staying keeps the pop-up and the page that opened it.
  await expect(popup.message).toHaveValue("unsaved popup");
  await expect(opener.tab.message).toHaveValue("unsaved opener");
  expect(await tabPaths(session)).toEqual(["/opener"]);

  await answerLeavePrompts(session.app, [true, false]);
  await quit(session);
  await expect
    .poll(() => leavePrompts(session.app))
    .toEqual([leavePrompt("popup"), leavePrompt("opener")]);
  await expect(opener.tab.message).toHaveValue("unsaved opener");
  await leaveAll(session);
});
