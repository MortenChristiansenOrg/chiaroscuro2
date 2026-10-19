/**
 * Which window a key press acts on (#115).
 *
 * Browser shortcuts act on the browser window. They work while the browser window has focus,
 * and while one of the windows shown over it as part of it has focus: its sub-tab window, the
 * command palette and an extension's toolbar popup. Any other window of the app, such as an
 * extension's pop-out or a website's popup, is a window of its own, as in Chrome: browser
 * shortcuts do not reach the browser from it, and Ctrl+W closes that window instead.
 */
export function shortcutWindow<W>(
  focused: W | null | undefined,
  browser: W | null | undefined,
  /** Windows shown over the browser window as part of it. */
  parts: ReadonlyArray<W | null | undefined>,
): W | undefined {
  if (!focused || !browser) return undefined;
  return focused === browser || parts.includes(focused) ? browser : undefined;
}

interface KeyInput {
  type: string;
  key: string;
  code?: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift?: boolean;
  isAutoRepeat?: boolean;
}

/** Ctrl+W or Ctrl+F4 (Cmd+W on macOS), which close the focused window if it has no tabs. */
export function isCloseWindowInput(input: KeyInput, platform = process.platform): boolean {
  if (input.type !== "keyDown" || input.alt) return false;
  const primary = platform === "darwin" ? input.meta : input.control;
  if (!primary) return false;
  const code = input.code ?? "";
  const key = input.key.toLowerCase();
  if (code === "KeyW" || key === "w") return true;
  return platform !== "darwin" && (code === "F4" || key === "f4");
}

interface RoutedWindow {
  readonly webContents: {
    on(
      event: "before-input-event",
      listener: (event: { preventDefault(): void }, input: KeyInput) => void,
    ): unknown;
  };
  close(): void;
}

interface WindowEvents<W> {
  on(
    event: "browser-window-focus" | "browser-window-blur" | "browser-window-created",
    listener: (event: unknown, win: W) => void,
  ): unknown;
}

/** Focus can move between the app's windows through a moment without a focused window. */
export const FOCUS_SETTLE_MS = 100;

/**
 * Keep browser shortcuts with the browser window (see `shortcutWindow`). They are global
 * shortcuts, which take their keys from every window, so they are only registered while the
 * browser window or a window shown as part of it has focus. Ctrl+W closes any other window.
 */
export function routeShortcutsToFocus<W extends RoutedWindow>(options: {
  app: WindowEvents<W>;
  focusedWindow(): W | null;
  /** The browser window that shortcuts pressed in this window act on, if any. */
  shortcutWindow(win: W | null): unknown;
  setShortcutsActive(active: boolean): void;
  platform?: NodeJS.Platform;
}): void {
  const { app, shortcutWindow, setShortcutsActive } = options;
  const follow = (win: W | null) => setShortcutsActive(!!shortcutWindow(win));
  app.on("browser-window-focus", (_event, win) => follow(win));
  app.on("browser-window-blur", () => {
    setTimeout(() => follow(options.focusedWindow()), FOCUS_SETTLE_MS);
  });
  app.on("browser-window-created", (_event, win) => {
    win.webContents.on("before-input-event", (event, input) => {
      if (!isCloseWindowInput(input, options.platform) || shortcutWindow(win)) return;
      event.preventDefault();
      // Held keys close it once.
      if (!input.isAutoRepeat) win.close();
    });
  });
}

/**
 * Win+Up and Win+Down, which Windows applies to the active window. The shell takes the arrow's
 * key press, so only its release reaches the app.
 */
export function windowArrowKey(
  input: KeyInput,
  platform = process.platform,
): "up" | "down" | undefined {
  if (platform !== "win32" || input.type !== "keyUp") return undefined;
  if (!input.meta || input.control || input.alt || input.shift) return undefined;
  if (input.key === "ArrowUp") return "up";
  if (input.key === "ArrowDown") return "down";
  return undefined;
}
