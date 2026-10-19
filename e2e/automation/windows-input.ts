import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Locator } from "playwright";
import type { AppSession } from "./session";

const run = promisify(execFile);

type WindowsArrow = "Up" | "Down" | "Left" | "Right";

/**
 * Click an element of a page with the desktop pointer and/or type with the desktop keyboard.
 * Unlike `windowsPointer`, no window is activated first, so the OS decides activation as it
 * would for a user. Works for pages in any of the app's windows, such as the sub-tab window,
 * and for the browser window's own UI.
 */
export async function windowsInput(
  session: AppSession,
  input: {
    click?: { webContentsId: number; locator: Locator };
    /** Only move the pointer over the element. */
    hover?: { webContentsId: number; locator: Locator };
    keys?: string;
    /** Arrow keys pressed with the Windows key, and Shift if given, one after another. */
    windowsArrows?: (WindowsArrow | `Shift+${WindowsArrow}`)[];
  },
): Promise<{ foregroundBefore: number; foregroundAfter: number; pointerWindow?: number }> {
  if (process.platform !== "win32") throw new Error("UNSUPPORTED: Windows desktop input required");
  if (input.click && input.hover) throw new Error("Click or hover, not both");
  const element = input.click ?? input.hover;
  // A small window can leave the element outside the page's viewport.
  if (element) await element.locator.scrollIntoViewIfNeeded();
  const box = element ? await element.locator.boundingBox() : null;
  if (element && !box) throw new Error("Element has no geometry");
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
        const view =
          win.webContents.id === webContentsId
            ? undefined
            : win.contentView.children.find(
                (child) => (child as Electron.WebContentsView).webContents?.id === webContentsId,
              );
        if (!view && win.webContents.id !== webContentsId) continue;
        const content = win.getContentBounds();
        const bounds = view?.getBounds() ?? { x: 0, y: 0 };
        const zoom = (
          (view as Electron.WebContentsView | undefined) ?? win
        ).webContents.getZoomFactor();
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
    { webContentsId: element?.webContentsId ?? -1, box },
  );
  const args = ["-AppWindow", native.appWindow];
  // The colon form keeps negative coordinates from being read as parameter names.
  if (native.point) args.push(`-X:${native.point.x}`, `-Y:${native.point.y}`);
  if (input.click) args.push("-Click");
  if (input.keys) args.push("-Keys", input.keys);
  if (input.windowsArrows?.length) args.push("-WindowsArrows", input.windowsArrows.join(","));
  const result = await run(
    "powershell.exe",
    ["-NoProfile", "-File", path.resolve("e2e/automation/windows-input.ps1"), ...args],
    // Cold PowerShell/Add-Type startup can be slow on Windows CI.
    { timeout: 30_000, windowsHide: true },
  );
  const observation = JSON.parse(result.stdout);
  session.record("windows-input", {
    input: { ...input, click: !!input.click, hover: !!input.hover },
    ...observation,
  });
  return observation;
}
