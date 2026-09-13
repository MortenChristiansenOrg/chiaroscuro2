import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { AppSession } from "./session";

const run = promisify(execFile);

/** Drive the OS pointer over the owned shell, including native title-bar hit testing. */
export async function windowsPointer(
  session: AppSession,
  point: { x: number; y: number },
  click = false,
): Promise<{ x: number; y: number; window: number; foreground: number; hitTest: number }> {
  if (process.platform !== "win32") throw new Error("UNSUPPORTED: Windows desktop input required");
  const native = await session.app.evaluate(({ BrowserWindow, screen }, point) => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.getParentWindow());
    if (!win) throw new Error("No owned shell window");
    win.show();
    win.focus();
    const bounds = win.getContentBounds();
    const zoom = win.webContents.getZoomFactor();
    const x = point.x * zoom;
    const y = point.y * zoom;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x >= bounds.width ||
      y >= bounds.height
    )
      throw new Error("Pointer position is outside the owned shell");
    const handle = win.getNativeWindowHandle();
    return {
      ...screen.dipToScreenPoint({ x: Math.round(bounds.x + x), y: Math.round(bounds.y + y) }),
      handle: (handle.length === 8
        ? handle.readBigUInt64LE()
        : BigInt(handle.readUInt32LE())
      ).toString(),
    };
  }, point);
  const result = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-File",
      path.resolve("e2e/automation/windows-pointer.ps1"),
      "-X",
      String(native.x),
      "-Y",
      String(native.y),
      "-ExpectedWindow",
      native.handle,
      ...(click ? ["-Click"] : []),
    ],
    // Cold PowerShell/Add-Type startup exceeded 15 seconds on Windows CI.
    // Native responsiveness still has its separate one-second WM_NCHITTEST limit.
    { timeout: 30_000, windowsHide: true },
  ).catch((error: unknown) => {
    const failure = error as Error & {
      code?: string | number;
      signal?: string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };
    session.record("windows-pointer-error", {
      point,
      click,
      code: failure.code,
      signal: failure.signal,
      killed: failure.killed,
      stdout: failure.stdout,
      stderr: failure.stderr,
    });
    throw error;
  });
  const observation = JSON.parse(result.stdout);
  session.record("windows-pointer", { point, click, ...observation });
  return observation;
}
