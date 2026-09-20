import { expect, test } from "../fixtures/electron-app";

test("downloaded update shows pending feedback and recovers from installation errors", async ({
  appSession: session,
}) => {
  // Isolated UI/IPC fixture: never install or quit the host browser during this scenario.
  await session.app.evaluate(({ BrowserWindow }) => {
    const hooks = (
      globalThis as unknown as {
        __testHooks: {
          commandBus: {
            unhandle(name: string): void;
            handle(name: string, handler: () => void): void;
          };
          updateApplyCount: number;
        };
      }
    ).__testHooks;
    hooks.updateApplyCount = 0;
    hooks.commandBus.unhandle("installer:apply-update");
    hooks.commandBus.handle("installer:apply-update", () => {
      hooks.updateApplyCount++;
      if (hooks.updateApplyCount === 2) throw new Error("Installer launch rejected");
    });
    const shell = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
    if (!shell) throw new Error("Shell unavailable");
    shell.webContents.send("bus:event:installer:update-downloaded", { version: "99.0.0" });
  });
  const restart = session.shell.getByRole("button", {
    name: "Restart to apply update",
    exact: true,
  });
  await expect(restart).toBeEnabled();
  await restart.click();
  const pending = session.shell.getByRole("button", { name: "Restarting to apply update" });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute("aria-busy", "true");
  await expect(
    session.shell.getByRole("button", { name: "Dismiss update notification" }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      session.app.evaluate(
        () =>
          (globalThis as unknown as { __testHooks: { updateApplyCount: number } }).__testHooks
            .updateApplyCount,
      ),
    )
    .toBe(1);
  expect((await session.capture("update-applying")).status).toBe("complete");

  // Real updater failures can arrive as events after the command already resolved.
  await session.app.evaluate(({ BrowserWindow }) => {
    const shell = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
    shell?.webContents.send("bus:event:installer:update-error", {
      message: "Cannot start installer",
    });
  });
  await expect(session.shell.getByRole("alert")).toHaveText("Cannot start installer");
  await expect(restart).toBeEnabled();
  expect((await session.capture("update-apply-error")).status).toBe("complete");
  await restart.click();
  await expect(session.shell.getByRole("alert")).toContainText("Installer launch rejected");
  await expect(restart).toBeEnabled();
  await restart.click();
  await expect(pending).toBeDisabled();
  await expect(session.shell.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      session.app.evaluate(
        () =>
          (globalThis as unknown as { __testHooks: { updateApplyCount: number } }).__testHooks
            .updateApplyCount,
      ),
    )
    .toBe(3);
});
