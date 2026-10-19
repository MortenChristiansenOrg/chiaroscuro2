import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Locator } from "playwright";
import type { AppSession } from "./session";

const run = promisify(execFile);

/**
 * Click an element of a page with the desktop pointer and/or type with the desktop keyboard.
 * Unlike `windowsPointer`, no window is activated first, so the OS decides activation as it
 * would for a user. Works for pages in any of the app's windows, such as the sub-tab window.
 */
export async function windowsInput(
  session: AppSession,
  input: { click?: { webContentsId: number; locator: Locator }; keys?: string },
): Promise<{ foregroundBefore: number; foregroundAfter: number; pointerWindow?: number }> {
  if (process.platform !== "win32") throw new Error("UNSUPPORTED: Windows desktop input required");
  const box = input.click ? await input.click.locator.boundingBox() : null;
  if (input.click && !box) throw new Error("Element has no geometry");
  const native = await session.app.evaluate(
    ({ BrowserWindow, screen }, { webContentsId, box }) => {
      const main = BrowserWindow.getAllWindows().find((win) => !win.getParentWindow());
      if (!main) throw new Error("No owned shell window");
      const handle = main.getNativeWindowHandle();
      const appWindow = (
        handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())
      ).toString();
      if (!box) return { appWindow };
      for (const win of BrowserWindow.getAllWindows()) {
        const view = win.contentView.children.find(
          (child) => (child as Electron.WebContentsView).webContents?.id === webContentsId,
        );
        if (!view) continue;
        const content = win.getContentBounds();
        const bounds = view.getBounds();
        const zoom = (view as Electron.WebContentsView).webContents.getZoomFactor();
        return {
          appWindow,
          point: screen.dipToScreenPoint({
            x: Math.round(content.x + bounds.x + (box.x + box.width / 2) * zoom),
            y: Math.round(content.y + bounds.y + (box.y + box.height / 2) * zoom),
          }),
        };
      }
      throw new Error(`No window shows contents ${webContentsId}`);
    },
    { webContentsId: input.click?.webContentsId ?? -1, box },
  );
  const args = ["-AppWindow", native.appWindow];
  // The colon form keeps negative coordinates from being read as parameter names.
  if (native.point) args.push(`-X:${native.point.x}`, `-Y:${native.point.y}`, "-Click");
  if (input.keys) args.push("-Keys", input.keys);
  const result = await run(
    "powershell.exe",
    ["-NoProfile", "-File", path.resolve("e2e/automation/windows-input.ps1"), ...args],
    // Cold PowerShell/Add-Type startup can be slow on Windows CI.
    { timeout: 30_000, windowsHide: true },
  );
  const observation = JSON.parse(result.stdout);
  session.record("windows-input", { input: { ...input, click: !!input.click }, ...observation });
  return observation;
}
