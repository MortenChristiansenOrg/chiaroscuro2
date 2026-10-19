interface FocusableContents {
  isDestroyed(): boolean;
  isFocused(): boolean;
  focus(): void;
  on(event: "focus" | "devtools-focused", listener: () => void): unknown;
  on(event: "input-event", listener: (event: unknown, input: { type: string }) => void): unknown;
}

interface FocusWindow {
  readonly webContents: FocusableContents;
  isDestroyed(): boolean;
  isFocused(): boolean;
  focus(): void;
  on(event: "focus" | "blur", listener: () => void): unknown;
}

/** Input that gives the contents under the pointer keyboard focus. */
const PRESS_EVENTS = new Set(["mouseDown", "touchStart"]);

/**
 * Give keyboard focus back to the page that had it when the window was deactivated.
 *
 * Outside macOS, Electron focuses a BrowserWindow's own WebContents (the shell)
 * whenever the window is activated. A page in a WebContentsView then keeps its
 * focused input, which still looks focused, but keystrokes go to the shell.
 * A click that activates the window decides for itself where focus goes.
 */
export class WindowContentFocus {
  private focused: FocusableContents | undefined;
  private focusedAtBlur: FocusableContents | undefined;
  private shellFocus: NodeJS.Immediate | undefined;
  private readonly tracked = new WeakSet<FocusableContents>();

  constructor(
    private readonly window: FocusWindow,
    /** Only contents that are still shown in this window may take focus back. */
    private readonly canRestore: (contents: FocusableContents) => boolean,
  ) {
    const shell = window.webContents;
    shell.on("focus", () => {
      // Deactivating the window can move focus to the shell just before "blur".
      // Commit it after the current native event so that move is not mistaken for the user's.
      this.cancelShellFocus();
      this.shellFocus = setImmediate(() => {
        this.shellFocus = undefined;
        this.focused = shell;
      });
    });
    this.trackPresses(shell);
    window.on("blur", () => {
      this.cancelShellFocus();
      this.focusedAtBlur = this.focused;
    });
    // Electron emits this after it has focused the shell, so the page's focus wins.
    window.on("focus", () => this.restore());
  }

  /** Follow focus in contents shown in this window. Contents can move between windows, so tracking twice is a no-op. */
  track(contents: FocusableContents): void {
    if (this.tracked.has(contents)) return;
    this.tracked.add(contents);
    contents.on("focus", () => this.focus(contents));
    // Typing into the page's docked DevTools must not be redirected to the page.
    contents.on("devtools-focused", () => this.focus(undefined));
    this.trackPresses(contents);
  }

  /** Activate the window and give keyboard focus to these contents once it is active. */
  activate(contents: FocusableContents): void {
    if (this.window.isDestroyed()) return;
    if (this.window.isFocused()) {
      if (!contents.isDestroyed() && this.canRestore(contents)) {
        contents.focus();
        this.focus(contents);
      }
      return;
    }
    // Restored by the window's focus event, after Electron has focused the shell.
    this.focusedAtBlur = contents;
    this.window.focus();
  }

  private trackPresses(contents: FocusableContents): void {
    contents.on("input-event", (_event, input) => {
      if (!PRESS_EVENTS.has(input.type)) return;
      // The click came before the window's focus event: nothing to restore.
      this.focusedAtBlur = undefined;
      // The click came after focus was restored elsewhere: follow the click.
      if (!contents.isDestroyed() && !contents.isFocused()) contents.focus();
    });
  }

  private focus(contents: FocusableContents | undefined): void {
    this.cancelShellFocus();
    this.focused = contents;
  }

  private cancelShellFocus(): void {
    if (this.shellFocus) clearImmediate(this.shellFocus);
    this.shellFocus = undefined;
  }

  private restore(): void {
    const contents = this.focusedAtBlur;
    this.focusedAtBlur = undefined;
    if (
      !contents ||
      this.window.isDestroyed() ||
      // Focus events are queued; the window may have lost activation again since.
      !this.window.isFocused() ||
      contents === this.window.webContents ||
      contents.isDestroyed() ||
      !this.canRestore(contents)
    )
      return;
    contents.focus();
    this.focus(contents);
  }
}
