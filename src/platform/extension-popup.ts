interface PopupWindow {
  isDestroyed(): boolean;
  close(): void;
  readonly webContents: { isDevToolsOpened(): boolean };
  on(event: "blur", listener: () => void): unknown;
}

/** How long after an action popup shows that focus returning to its browser window keeps it open. */
export const POPUP_FOCUS_GRACE_MS = 200;

/**
 * Close an extension's action popup when it loses focus, as Chrome does. Call once it is shown
 * and focused.
 *
 * The click that opened the popup can hand focus back to its browser window just after the popup
 * shows, which is not a dismissal. Focus moving anywhere else in that time is, such as to a
 * window the extension opened from the popup, so the popup closes when the grace period ends.
 */
export function closePopupOnBlur(
  popup: PopupWindow,
  browserWindow: unknown,
  focusedWindow: () => unknown,
  graceMs = POPUP_FOCUS_GRACE_MS,
): void {
  let settling = true;
  let blurredWhileSettling = false;
  const close = () => {
    if (!popup.isDestroyed() && !popup.webContents.isDevToolsOpened()) popup.close();
  };
  popup.on("blur", () => {
    if (settling) blurredWhileSettling = true;
    else close();
  });
  setTimeout(() => {
    settling = false;
    if (!blurredWhileSettling) return;
    const focused = focusedWindow();
    if (focused !== popup && focused !== browserWindow) close();
  }, graceMs);
}
