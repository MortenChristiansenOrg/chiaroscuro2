interface FocusableContents {
  isDestroyed(): boolean;
  focus(): void;
  on(event: "focus", listener: () => void): unknown;
}

interface FocusWindow {
  readonly webContents: FocusableContents;
  isDestroyed(): boolean;
  on(event: "focus" | "blur", listener: () => void): unknown;
}

/**
 * Give keyboard focus back to the page that had it when the window was deactivated.
 *
 * Outside macOS, Electron focuses a BrowserWindow's own WebContents (the shell)
 * whenever the window is activated. A page in a WebContentsView then keeps its
 * focused input, which still looks focused, but keystrokes go to the shell.
 */
export class WindowContentFocus {
  private focused: FocusableContents | undefined;
  private focusedAtBlur: FocusableContents | undefined;
  private focusChanges = 0;

  constructor(
    private readonly window: FocusWindow,
    /** Only contents that are still shown in this window may take focus back. */
    private readonly canRestore: (contents: FocusableContents) => boolean,
  ) {
    this.track(window.webContents);
    window.on("blur", () => {
      this.focusedAtBlur = this.focused;
    });
    // Electron emits this after it has focused the shell, so the page's focus wins.
    window.on("focus", () => this.restore());
  }

  track(contents: FocusableContents): void {
    contents.on("focus", () => {
      // Deactivating the window can move focus to the shell just before "blur".
      // Commit after the current native event so that move is not mistaken for the user's.
      const change = ++this.focusChanges;
      setImmediate(() => {
        if (change === this.focusChanges) this.focused = contents;
      });
    });
  }

  private restore(): void {
    const contents = this.focusedAtBlur;
    this.focusedAtBlur = undefined;
    if (
      !contents ||
      this.window.isDestroyed() ||
      contents === this.window.webContents ||
      contents.isDestroyed() ||
      !this.canRestore(contents)
    )
      return;
    contents.focus();
  }
}
