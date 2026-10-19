/** Windows sends WM_ACTIVATE to a window as it is activated, before its focus event. */
export const WM_ACTIVATE = 0x0006;
/** WM_ACTIVATE's activation state in the low word of wParam. */
const WA_INACTIVE = 0;
const WA_CLICKACTIVE = 2;

/**
 * Outside Windows, the press that activated a window reaches its contents around the window's
 * focus event. This is how long after that event it still counts.
 */
export const ACTIVATION_PRESS_MS = 100;

/**
 * Tells whether a window was activated by a click or touch on it, rather than by the taskbar, a
 * window switcher, the app itself or another program (#131).
 *
 * On Windows, WM_ACTIVATE says so before the window's focus event. Elsewhere the answer waits
 * briefly for a press to reach the window's contents, which can arrive just after that event.
 */
export class ActivationOrigin {
  private clickActivated = false;
  private pressed = false;
  private pending: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  /** Follow the window's WM_ACTIVATE messages: the low word of their wParam. */
  activateMessage(state: number): void {
    if (state !== WA_INACTIVE) this.clickActivated = state === WA_CLICKACTIVE;
  }

  /** A mouse or touch press reached contents shown in the window. */
  press(): void {
    this.pressed = true;
  }

  /** The window was deactivated. Presses from now on may activate it again. */
  blur(): void {
    this.cancel();
    this.pressed = false;
  }

  /** The window was activated. Calls back with whether a click or touch on it did that. */
  focus(callback: (clicked: boolean) => void): void {
    this.cancel();
    if (this.platform === "win32") {
      const clicked = this.clickActivated;
      this.clickActivated = false;
      // Electron focuses the window's own contents after its focus event.
      this.pending = setTimeout(() => {
        this.pending = undefined;
        callback(clicked);
      });
      return;
    }
    this.pending = setTimeout(() => {
      this.pending = undefined;
      callback(this.pressed);
    }, ACTIVATION_PRESS_MS);
  }

  private cancel(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = undefined;
  }
}
