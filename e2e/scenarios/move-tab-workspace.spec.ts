import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";

for (const inactive of [false, true]) {
  test(`move ${inactive ? "inactive" : "last active"} ephemeral tab through the workspace submenu`, async ({
    appSession: session,
  }) => {
    const site = await startSite();
    try {
      const page = await VerificationPage.navigate(session, `${site.url}/first`);
      await page.page.goto(`${site.url}/second`);
      await page.submit("page state survives the move");
      const source = await session.target(
        (t) => t.kind === "tab" && t.url === `${site.url}/second`,
      );
      const sourceWorkspace = (
        await session.debug<{ activeWorkspaceId: string }>("/state/workspaces")
      ).activeWorkspaceId;
      const destination = await session.command<string>("workspaces:create", {
        name: "Personal",
        color: "#cc6677",
        icon: "P",
      });
      await session.command("workspaces:create", { name: "Research", color: "#6677cc", icon: "R" });
      const remaining = inactive
        ? await session.command<string>("tabs:create", { url: `${site.url}/remaining` })
        : null;
      const count = (await session.targets()).filter((t) => t.kind === "tab").length;
      const history = await session.app.evaluate(({ webContents }, id) => {
        const wc = webContents.fromId(id)!;
        wc.setZoomLevel(1);
        return wc.navigationHistory.getAllEntries().map((entry) => entry.url);
      }, source.webContentsId);
      // Native menus have no CDP target. Right-click the real UI, inspect the native
      // menu, then invoke its actual child callback (same boundary as duplicate-tab).
      await session.app.evaluate(({ Menu }) => {
        const original = Menu.prototype.popup;
        Menu.prototype.popup = function (options) {
          (
            globalThis as typeof globalThis & { verificationMenu?: Electron.Menu }
          ).verificationMenu = this;
          Menu.prototype.popup = original;
          return original.call(this, options);
        };
      });
      await session.shell.locator(`[data-tab-id="${source.tabId}"]`).click({ button: "right" });
      await expect
        .poll(() =>
          session.app.evaluate(() => {
            const menu = (globalThis as typeof globalThis & { verificationMenu?: Electron.Menu })
              .verificationMenu;
            return menu?.items
              .find((item) => item.label === "Move to workspace")
              ?.submenu?.items.map((item) => item.label);
          }),
        )
        .toEqual(["Personal", "Research"]);
      expect((await session.capture("move-workspace-menu")).status).toBe("complete");
      const cursor = await session.eventCursor();
      await session.app.evaluate(() => {
        const root = globalThis as typeof globalThis & { verificationMenu?: Electron.Menu };
        const menu = root.verificationMenu!;
        menu.items.find((item) => item.label === "Move to workspace")!.submenu!.items[0]!.click();
        menu.closePopup();
        delete root.verificationMenu;
      });
      await session.waitForEvent("workspaces:switched", cursor);
      expect(await session.debug("/state/workspaces")).toMatchObject({
        activeWorkspaceId: destination,
      });
      const moved = await session.target((t) => t.tabId === source.tabId && t.visible);
      expect(moved.webContentsId).toBe(source.webContentsId);
      expect((await session.targets()).filter((t) => t.kind === "tab")).toHaveLength(count);
      await expect(page.result).toHaveText("page state survives the move");
      await expect(page.message).toHaveValue("page state survives the move");
      expect(
        await session.app.evaluate(({ webContents }, id) => {
          const wc = webContents.fromId(id)!;
          return {
            history: wc.navigationHistory.getAllEntries().map((entry) => entry.url),
            zoom: wc.getZoomLevel(),
          };
        }, moved.webContentsId),
      ).toEqual({ history, zoom: 1 });
      const tabs = await session.debug<{
        all: Record<string, { id: string; workspaceId: string; bookmarked: boolean }>;
        activeTabId: string;
      }>("/state/tabs");
      expect(tabs.activeTabId).toBe(source.tabId);
      expect(tabs.all[source.tabId!]).toMatchObject({
        workspaceId: destination,
        bookmarked: false,
      });
      expect((await session.capture("moved-workspace-tab")).status).toBe("complete");
      await session.command("workspaces:switch", { workspaceId: sourceWorkspace });
      await expect(session.shell.locator(`[data-tab-id="${source.tabId}"]`)).toHaveCount(0);
      expect((await session.debug<{ activeTabId?: string }>("/state/tabs")).activeTabId).toBe(
        remaining ?? undefined,
      );
    } finally {
      await site.close();
    }
  });
}
