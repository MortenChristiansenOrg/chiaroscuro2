import { answerLeavePrompts, leavePrompts, warnBeforeUnload } from "../automation/leave-prompt";
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

/** Open a tab with unsaved changes. Chromium only honours beforeunload after a user gesture. */
async function unsavedTab(session: Parameters<typeof VerificationPage.navigate>[0], page: string) {
  const tab = await VerificationPage.navigate(session, `${site.url}/${page}`);
  await tab.submit(`unsaved ${page}`);
  await warnBeforeUnload(tab.page);
  const target = await session.target((t) => t.kind === "tab" && t.url.endsWith(`/${page}`));
  return { tab, row: session.shell.locator(`[data-tab-id="${target.tabId}"]`) };
}

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
});

test("quitting with unsaved changes neither asks nor hangs", async ({ appSession: session }) => {
  await unsavedTab(session, "first");
  await unsavedTab(session, "second");
  // Quitting keeps tabs for the next session, so it discards pages without asking.
  await answerLeavePrompts(session.app, []);
  const prompts: string[] = [];
  session.app.process().stdout?.on("data", (chunk: Buffer) => {
    if (chunk.toString().includes("leave-prompt-shown")) prompts.push("shown");
  });
  await session.app.evaluate(({ dialog }) => {
    const stay = dialog.showMessageBoxSync;
    dialog.showMessageBoxSync = ((...args: Parameters<typeof stay>) => {
      console.log("leave-prompt-shown");
      return stay(...args);
    }) as typeof stay;
  });
  // AppSession.stop fails if Electron does not exit within its shutdown deadline.
  await session.stop();
  expect(prompts).toEqual([]);
});
