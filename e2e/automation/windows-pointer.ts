import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AppSession } from "./session";

const run = promisify(execFile);

/**
 * Drive the OS pointer over the owned shell, including native title-bar hit testing. The shell is
 * activated natively; with `activate`, the app activates it first, too.
 */
export async function windowsPointer(
  session: AppSession,
  point: { x: number; y: number },
  click = false,
  activate = true,
): Promise<{ x: number; y: number; window: number; foreground: number; hitTest: number }> {
  if (process.platform !== "win32") throw new Error("UNSUPPORTED: Windows desktop input required");
  const native = await session.app.evaluate(
    ({ BrowserWindow, screen }, { point, activate }) => {
      // Other top-level windows of the app, such as a website's popup, are not the shell.
      const win = BrowserWindow.getAllWindows().find(
        (candidate) =>
          !candidate.getParentWindow() && candidate.webContents.getURL().includes("/out/renderer/"),
      );
      if (!win) throw new Error("No owned shell window");
      if (activate) {
        win.show();
        win.focus();
      }
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
    },
    { point, activate },
  );
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

/**
 * Native WM_NCHITTEST results for points of the owned shell, without moving the pointer:
 * `HTCLIENT` (1) or `HTCAPTION` (2). One PowerShell call answers all of them.
 */
export async function windowsHitTests(
  session: AppSession,
  points: { x: number; y: number }[],
): Promise<number[]> {
  if (process.platform !== "win32") throw new Error("UNSUPPORTED: Windows desktop input required");
  const native = await session.app.evaluate(({ BrowserWindow, screen }, points) => {
    const win = BrowserWindow.getAllWindows().find(
      (candidate) =>
        !candidate.getParentWindow() && candidate.webContents.getURL().includes("/out/renderer/"),
    );
    if (!win) throw new Error("No owned shell window");
    const bounds = win.getContentBounds();
    const zoom = win.webContents.getZoomFactor();
    const handle = win.getNativeWindowHandle();
    return {
      points: points.map(({ x, y }) => {
        const point = screen.dipToScreenPoint({
          x: Math.round(bounds.x + x * zoom),
          y: Math.round(bounds.y + y * zoom),
        });
        return [point.x, point.y];
      }),
      handle: (handle.length === 8
        ? handle.readBigUInt64LE()
        : BigInt(handle.readUInt32LE())
      ).toString(),
    };
  }, points);
  const file = path.join(session.artifactDir, `hit-test-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(native.points));
  const result = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-File",
      path.resolve("e2e/automation/windows-hit-test.ps1"),
      "-PointsFile",
      file,
      "-Window",
      native.handle,
    ],
    { timeout: 30_000, windowsHide: true },
  );
  const hits: number[] = JSON.parse(result.stdout);
  session.record("windows-hit-tests", { points, hits });
  return hits;
}
