import path from "node:path";
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

test("sub-tab action icons render without external assets and close/promote still work", async ({
  appSession: session,
}) => {
  // Packaged builds do not ship the Font Awesome development dependency.
  await session.app.evaluate(({ session: electronSession }) => {
    electronSession.defaultSession.webRequest.onBeforeRequest(
      { urls: ["file://*/*fontawesome-free/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
  });
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const child = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  for (const name of ["Close sub-tab", "Open as tab"]) {
    const icon = frame.getByRole("button", { name, exact: true }).locator("svg");
    await expect(icon).toBeVisible();
    const appearance = await icon.evaluate((svg: SVGSVGElement) => {
      const path = svg.querySelector("path");
      if (!path) throw new Error("Missing icon shape");
      const bounds = path.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        fill: getComputedStyle(path).fill,
        color: getComputedStyle(svg.closest("button") as HTMLElement).color,
      };
    });
    expect(appearance.width).toBeGreaterThan(10);
    expect(appearance.height).toBeGreaterThan(10);
    expect(appearance.fill).toBe(appearance.color);
    expect(appearance.fill).toBe("oklch(0.35 0 0)");
  }
  await frame.screenshot({ path: path.join(session.artifactDir, "action-icons.renderer.png") });
  expect((await session.capture("action-icons")).status).toBe("complete");
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "close button removes child",
    () => session.targets(),
    (targets) => !targets.some((t) => t.id === child.id),
  );
  await parent.subTab.click();
  const nextChild = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const childPage = new VerificationPage(await session.page(nextChild));
  await childPage.submit("preserve promotion state");
  await frame.getByRole("button", { name: "Open as tab", exact: true }).click();
  await session.target(
    (t) => t.kind === "tab" && t.webContentsId === nextChild.webContentsId && t.visible,
  );
  await expect(childPage.message).toHaveValue("preserve promotion state");
  await expect(childPage.result).toHaveText("preserve promotion state");
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
  // Keep the owned shell above the Windows runner terminal during desktop capture.
  await session.app.evaluate(({ BrowserWindow }) => {
    const shell = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
    shell?.setAlwaysOnTop(true);
  });
  try {
    expect((await session.capture("nested-resized")).status).toBe("complete");
  } finally {
    await session.app.evaluate(({ BrowserWindow }) => {
      const shell = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
      shell?.setAlwaysOnTop(false);
    });
  }

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

test("sub-tab promotion and dismissal finish when backdrop animation frames stop", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const first = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "warm-up child closes",
    () => session.targets(),
    (targets) => !targets.some((t) => t.id === first.id),
  );

  // Reproduce a compositor that delivers one frame, then suspends painting.
  // Timers and input remain available, as when native window visibility changes.
  await frame.evaluate(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    let delivered = false;
    window.requestAnimationFrame = (callback) => {
      if (delivered) return 0;
      delivered = true;
      return requestFrame(callback);
    };
  });
  await session.shell.getByRole("button", { name: "Maximize", exact: true }).click();
  await expect(session.shell.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  const frameTarget = await session.target((t) => t.kind === "sub-tab-frame");
  await session.recordFrames(frameTarget, "suspended-entry-promotion", async () => {
    await parent.subTab.click();
    await expect(frame.getByRole("button", { name: "Open as tab", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "Open as tab", exact: true }).click();
    await session.target((t) => t.kind === "tab" && t.url === `${site.url}/child` && t.visible);
    await expect(frame.locator("#backdrop")).toHaveCSS("opacity", "0");
  });
  const promoted = await session.target((t) => t.kind === "tab" && t.url === `${site.url}/child`);
  const promotedPage = new VerificationPage(await session.page(promoted));
  await promotedPage.submit("promoted after suspended frames");
  await expect(promotedPage.result).toHaveText("promoted after suspended frames");
  await expect(frame.locator("#backdrop")).toHaveCSS("opacity", "0");
  await session.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => !w.getParentWindow())
      ?.setAlwaysOnTop(true);
  });
  try {
    expect((await session.capture("promotion-restored")).status).toBe("complete");
  } finally {
    await session.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.getParentWindow())
        ?.setAlwaysOnTop(false);
    });
  }

  // Exercise both entry and exit with no subsequent compositor callbacks.
  await promotedPage.subTab.click();
  const next = await session.target((t) => t.kind === "sub-tab" && t.visible);
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "suspended-frame child closes",
    () => session.targets(),
    (targets) => !targets.some((t) => t.id === next.id),
  );
  await expect(frame.locator("#backdrop")).toHaveCSS("opacity", "0");
  await promotedPage.message.fill("");
  await promotedPage.submit("parent usable after suspended exit");
  await expect(promotedPage.result).toHaveText("parent usable after suspended exit");
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

test("sub-tab remains usable when beforeunload prevents closing", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const target = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const child = new VerificationPage(await session.page(target));
  await child.submit("unsaved child input");
  // Electron handles the beforeunload decision through will-prevent-unload;
  // Playwright's automatic dialog dismissal would race that native decision.
  child.page.on("dialog", () => {});
  await child.page.evaluate(() => {
    window.onbeforeunload = () => false;
  });
  await expect(
    session.command("sub-tabs:close", {
      parentTabId: target.parentId?.replace(/^tab:/, ""),
    }),
  ).rejects.toThrow("Page prevented closing");
  await session.target((t) => t.id === target.id && t.visible);
  await expect(child.message).toHaveValue("unsaved child input");
  await child.message.fill("");
  await child.submit("still usable");
  await expect(child.result).toHaveText("still usable");
  await child.page.evaluate(() => {
    window.onbeforeunload = null;
  });
  const frame = await session.page(await session.target((t) => t.kind === "sub-tab-frame"));
  await frame.getByRole("button", { name: "Close sub-tab", exact: true }).click();
  await waitUntil(
    "accepted close destroys child",
    () => session.targets(),
    (targets) => !targets.some((t) => t.id === target.id),
  );
});

test("closing a parent preserves a vetoing child as a standalone tab", async ({
  appSession: session,
}) => {
  const parent = await VerificationPage.navigate(session, `${site.url}/parent`);
  await parent.subTab.click();
  const target = await session.target((t) => t.kind === "sub-tab" && t.visible);
  const child = new VerificationPage(await session.page(target));
  await child.submit("unsaved child state");
  child.page.on("dialog", () => {});
  await child.page.evaluate(() => {
    window.onbeforeunload = () => false;
  });
  const parentRow = session.shell.locator(
    `[data-tab-id="${target.parentId?.replace(/^tab:/, "")}"]`,
  );
  await parentRow.hover();
  await parentRow.getByRole("button", { name: "Close tab", exact: true }).click();
  const preserved = await session.target(
    (t) => t.kind === "tab" && t.webContentsId === target.webContentsId && t.visible,
  );
  expect(preserved.tabId).toBe(target.tabId);
  await expect(parentRow).toHaveCount(0);
  await expect(child.message).toHaveValue("unsaved child state");
  await child.message.fill("");
  await child.submit("preserved child focus");
  await expect(child.result).toHaveText("preserved child focus");
  await session.shell.screenshot({
    path: path.join(session.artifactDir, "preserved-child-shell.renderer.png"),
  });
  expect((await session.targets()).filter((t) => t.kind === "sub-tab")).toHaveLength(0);
  await child.page.evaluate(() => {
    window.onbeforeunload = null;
  });
  const preservedRow = session.shell.locator(`[data-tab-id="${preserved.tabId}"]`);
  await preservedRow.hover();
  await preservedRow.getByRole("button", { name: "Close tab", exact: true }).click();
  await expect(preservedRow).toHaveCount(0);
  await waitUntil(
    "accepted close destroys preserved child",
    () => session.targets(),
    (targets) => !targets.some((t) => t.webContentsId === target.webContentsId),
  );
});
