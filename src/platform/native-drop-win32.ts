/**
 * Win32 native file drop handler.
 *
 * `backgroundMaterial: "acrylic"` prevents OS drag events from reaching
 * Chromium's OLE IDropTarget. We bypass this by registering the window
 * for the older WM_DROPFILES mechanism (DragAcceptFiles / shell32),
 * which routes through the standard Win32 message queue.
 */
import type { BrowserWindow } from "electron";
import koffi from "koffi";

const WM_DROPFILES = 0x0233;

const shell32 = koffi.load("shell32.dll");

const DragAcceptFiles = shell32.func("void DragAcceptFiles(uintptr_t hWnd, bool fAccept)");

const DragQueryFileW = shell32.func(
  "uint32_t DragQueryFileW(uintptr_t hDrop, uint32_t iFile, uint16_t* lpszFile, uint32_t cch)",
);

const DragFinish = shell32.func("void DragFinish(uintptr_t hDrop)");

function readPointer(buf: Buffer): bigint {
  return buf.readBigUInt64LE(0);
}

function getDroppedFiles(hDrop: bigint): string[] {
  const hDropNum = Number(hDrop);
  const count = DragQueryFileW(hDropNum, 0xffffffff, null, 0) as number;

  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = DragQueryFileW(hDropNum, i, null, 0) as number;
    const buf = Buffer.alloc((len + 1) * 2);
    DragQueryFileW(hDropNum, i, buf, len + 1);
    paths.push(buf.toString("utf16le").replace(/\0+$/, ""));
  }

  DragFinish(hDropNum);
  return paths;
}

/**
 * Register the BrowserWindow for Win32 file drops and return dropped
 * file paths via the callback.
 */
export function enableNativeFileDrop(
  win: BrowserWindow,
  onDrop: (filePaths: string[]) => void,
): void {
  const hwnd = Number(readPointer(win.getNativeWindowHandle()));
  DragAcceptFiles(hwnd, true);

  win.hookWindowMessage(WM_DROPFILES, (wParam: Buffer) => {
    const hDrop = readPointer(wParam);
    const paths = getDroppedFiles(hDrop);
    if (paths.length > 0) onDrop(paths);
  });
}
