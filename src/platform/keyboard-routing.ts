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

const WINDOW_ARROWS: Record<string, "up" | "down"> = { ArrowUp: "up", ArrowDown: "down" };

/**
 * Recognizes Win+Up and Win+Down, which Windows applies to the active window itself. The shell
 * takes the arrow's key press, so only its release reaches the app, while the Windows key is held
 * or just after its release. An arrow release counts when its press did not reach the app and the
 * Windows key was held for it: held now, or released with no key pressed since.
 */
export class WindowArrowKeys {
  /** Arrows whose press reached the app, so the shell did not take it. */
  private readonly pressed = new Set<string>();
  private windowsKeyHeld = false;
  /** The Windows key is held, or was released with no key pressed since. */
  private windowsKey = false;

  constructor(private readonly platform = process.platform) {}

  /** Follow a key event of the window; returns the arrow of a completed Win+Up or Win+Down. */
  input(input: KeyInput): "up" | "down" | undefined {
    if (this.platform !== "win32") return undefined;
    if (input.type === "keyDown" || input.type === "rawKeyDown") {
      if (input.key === "Meta") {
        this.windowsKeyHeld = true;
        this.windowsKey = true;
      } else {
        this.windowsKey = this.windowsKeyHeld;
        if (WINDOW_ARROWS[input.key]) this.pressed.add(input.key);
      }
      return undefined;
    }
    if (input.type !== "keyUp") return undefined;
    if (input.key === "Meta") {
      this.windowsKeyHeld = false;
      return undefined;
    }
    const arrow = WINDOW_ARROWS[input.key];
    if (!arrow) return undefined;
    if (this.pressed.delete(input.key)) return undefined;
    if (!this.windowsKey || input.control || input.alt || input.shift) return undefined;
    return arrow;
  }

  /** Key events of a window that lost focus go elsewhere. */
  reset(): void {
    this.pressed.clear();
    this.windowsKeyHeld = false;
    this.windowsKey = false;
  }
}
