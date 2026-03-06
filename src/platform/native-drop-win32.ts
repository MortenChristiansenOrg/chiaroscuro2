/**
 * Win32 native file drop handler.
 *
 * `backgroundMaterial: "acrylic"` prevents OS drag events from reaching
 * Chromium's OLE IDropTarget. We bypass this by registering the window
 * for the older WM_DROPFILES mechanism (DragAcceptFiles / shell32),
 * which routes through the standard Win32 message queue.
 *
 * All koffi / shell32 bindings are lazily initialized so this module
 * can be imported on non-Windows platforms without side-effects.
 */
import type { BrowserWindow } from "electron";

const WM_DROPFILES = 0x0233;

// biome-ignore lint/suspicious/noExplicitAny: koffi types are opaque FFI handles
let _bindings: { DragAcceptFiles: any; DragQueryFileW: any; DragFinish: any } | undefined;

function bindings() {
  if (_bindings) return _bindings;

  // Dynamic require so the module-level evaluation doesn't crash on Linux
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require("koffi") as typeof import("koffi");

  const shell32 = koffi.load("shell32.dll");
  const HWND = koffi.pointer("HWND", koffi.opaque());
  const HDROP = koffi.pointer("HDROP", koffi.opaque());

  _bindings = {
    DragAcceptFiles: shell32.func("void DragAcceptFiles(HWND hWnd, bool fAccept)"),
    DragQueryFileW: shell32.func(
      "uint32_t DragQueryFileW(HDROP hDrop, uint32_t iFile, uint16_t* lpszFile, uint32_t cch)",
    ),
    DragFinish: shell32.func("void DragFinish(HDROP hDrop)"),
  };

  // Suppress unused-variable warnings for type-registration side-effects
  void HWND;
  void HDROP;

  return _bindings;
}

function readPointer(buf: Buffer): bigint {
  if (buf.length === 4) return BigInt(buf.readUInt32LE(0));
  return buf.readBigUInt64LE(0);
}

function getDroppedFiles(hDrop: bigint): string[] {
  const { DragQueryFileW, DragFinish } = bindings();
  const hDropNum = Number(hDrop);
  try {
    const count = DragQueryFileW(hDropNum, 0xffffffff, null, 0) as number;
    const paths: string[] = [];
    for (let i = 0; i < count; i++) {
      const len = DragQueryFileW(hDropNum, i, null, 0) as number;
      const buf = Buffer.alloc((len + 1) * 2);
      DragQueryFileW(hDropNum, i, buf, len + 1);
      paths.push(buf.toString("utf16le").replace(/\0+$/, ""));
    }
    return paths;
  } finally {
    DragFinish(hDropNum);
  }
}

/**
 * Register the BrowserWindow for Win32 file drops and return dropped
 * file paths via the callback.
 */
export function enableNativeFileDrop(
  win: BrowserWindow,
  onDrop: (filePaths: string[]) => void,
): void {
  const { DragAcceptFiles } = bindings();
  const hwnd = Number(readPointer(win.getNativeWindowHandle()));
  DragAcceptFiles(hwnd, true);

  win.hookWindowMessage(WM_DROPFILES, (wParam: Buffer) => {
    const hDrop = readPointer(wParam);
    const paths = getDroppedFiles(hDrop);
    if (paths.length > 0) onDrop(paths);
  });

  // No cleanup needed — hookWindowMessage is automatically released when
  // the BrowserWindow is destroyed. Calling unhookWindowMessage in `closed`
  // would throw "Object has been destroyed".
}
