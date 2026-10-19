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
  /**
   * The window was deactivated and has not been active for its focus event since. Activations
   * that end before their focus event runs leave the page to restore as it was (#131).
   */
  private awaitingRestore = false;
  private shellFocus: NodeJS.Immediate | undefined;
  private readonly tracked = new WeakSet<FocusableContents>();
  private readonly pressListeners = new Set<() => void>();

  constructor(
    private readonly window: FocusWindow,
    /** Only contents that are still shown in this window may take focus back. */
    private readonly canRestore: (contents: FocusableContents) => boolean,
    /**
     * For a window whose own contents only frame a page, such as the sub-tab window: the page to
     * return to instead of the frame. Electron reports focus moving to the frame on activation
     * before it reports the window's earlier deactivation, so the frame can look like it had focus.
     */
    private readonly framedPage?: () => FocusableContents | undefined,
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
      if (this.awaitingRestore) return;
      this.awaitingRestore = true;
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
    this.awaitingRestore = true;
    this.window.focus();
  }

  /** Follow mouse and touch presses in this window's own contents and the contents it shows. */
  onPress(listener: () => void): () => void {
    this.pressListeners.add(listener);
    return () => this.pressListeners.delete(listener);
  }

  private trackPresses(contents: FocusableContents): void {
    contents.on("input-event", (_event, input) => {
      if (!PRESS_EVENTS.has(input.type)) return;
      // Contents tracked here may have moved to another window since.
      if (contents === this.window.webContents || this.canRestore(contents)) {
        for (const listener of this.pressListeners) listener();
      }
      // The click came before the window's focus event: nothing to restore.
      this.focusedAtBlur = undefined;
      this.awaitingRestore = false;
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
    if (this.window.isDestroyed()) return;
    // Focus events are queued; the window may have lost activation again since. The shell's
    // focus on that activation is Electron's, and the page still waits for the next one.
    if (!this.window.isFocused()) {
      this.cancelShellFocus();
      return;
    }
    const contents =
      this.focusedAtBlur === this.window.webContents && this.framedPage
        ? this.framedPage()
        : this.focusedAtBlur;
    this.focusedAtBlur = undefined;
    this.awaitingRestore = false;
    if (
      !contents ||
      contents === this.window.webContents ||
      contents.isDestroyed() ||
      !this.canRestore(contents)
    )
      return;
    contents.focus();
    this.focus(contents);
  }
}
