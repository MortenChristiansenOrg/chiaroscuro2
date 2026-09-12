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

test("sub-tab transitions survive nested opens, resize, rapid close and reopen", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const child = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const childPage = new VerificationPage(await session.page(child));
  await childPage.subTab.click();
  const nested = await session.target(
    (t) => t.kind === "sub-tab" && t.visible && t.id !== child.id,
  );
  const nestedPage = new VerificationPage(await session.page(nested));
  await nestedPage.submit("nested focus");
  await expect(nestedPage.result).toHaveText("nested focus");
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await session.target((t) => t.id === child.id && t.visible);
  await waitUntil(
    "nested removal",
    () => session.targets(),
    (targets) => !targets.some((t) => t.id === nested.id),
  );
  await childPage.submit("restored child focus");
  await expect(childPage.result).toHaveText("restored child focus");

  // Deliberate resize during the entry animation, using native geometry as setup.
  const cursor = await session.eventCursor();
  await childPage.subTab.click();
  await session.waitForEvent("sub-tabs:opened", cursor);
  const resizedChild = await session.target(
    (t) => t.kind === "sub-tab" && t.visible && t.id !== child.id,
  );
  await session.app.evaluate(({ BrowserWindow }) => {
    const shell = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
    if (!shell) throw new Error("No shell");
    const bounds = shell.getBounds();
    shell.setBounds({ ...bounds, width: bounds.width - 120, height: bounds.height - 80 });
  });
  await expect
    .poll(async () => {
      const targets = await session.targets();
      const frameTarget = targets.find((t) => t.kind === "sub-tab-frame");
      const view = targets.find((t) => t.id === resizedChild.id);
      if (!frameTarget || !view) return false;
      return (
        view.bounds.width === Math.round(frameTarget.bounds.width * 0.88 - 60) &&
        view.bounds.height === Math.round(frameTarget.bounds.height * 0.85)
      );
    })
    .toBe(true);
  expect((await session.capture("nested-resized")).status).toBe("complete");

  // Two immediate visible close actions must unwind two stack entries in order.
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).dblclick();
  await waitUntil(
    "all children removed",
    () => session.targets(),
    (targets) => !targets.some((t) => t.kind === "sub-tab"),
  );
  await parent.subTab.click();
  const reopened = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const reopenedPage = new VerificationPage(await session.page(reopened));
  await reopenedPage.submit("reopened focus");
  await expect(reopenedPage.result).toHaveText("reopened focus");
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "reopened child removal",
    () => session.targets(),
    (targets) => !targets.some((t) => t.kind === "sub-tab"),
  );
  await parent.submit("parent restored");
  await expect(parent.result).toHaveText("parent restored");
});

test("sub-tab backdrop honors reduced motion and settles interrupted promises", async ({
  appSession: session,
}) => {
  // This setup isolates the preference path without changing the host OS settings.
  await session.app.evaluate(({ systemPreferences }) => {
    const current = systemPreferences.getAnimationSettings();
    systemPreferences.getAnimationSettings = () => ({ ...current, prefersReducedMotion: true });
  });
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const target = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  await frame.emulateMedia({ reducedMotion: "reduce" });
  const backdrop = await frame.evaluate(async () => {
    const api = window as unknown as {
      exitAnimation(): Promise<void>;
      enterAnimation(x: number, y: number, width: number, height: number): Promise<void>;
      hide(): void;
    };
    await api.exitAnimation();
    const hidden = document.getElementById("backdrop")?.style.opacity;
    await api.enterAnimation(80, 60, 700, 500);
    return { hidden, shown: document.getElementById("backdrop")?.style.opacity };
  });
  expect(backdrop).toEqual({ hidden: "0", shown: "1" });
  await frame.emulateMedia({ reducedMotion: "no-preference" });
  await frame.evaluate(async () => {
    const api = window as unknown as { exitAnimation(): Promise<void>; hide(): void };
    const pending = api.exitAnimation();
    api.hide();
    await pending;
  });
  await session.command("sub-tabs:close", { parentTabId: target.parentId?.replace(/^tab:/, "") });
  await waitUntil(
    "reduced-motion child removal",
    () => session.targets(),
    (targets) => !targets.some((t) => t.kind === "sub-tab"),
  );
});
