import { type BrowserWindow, dialog } from "electron";

/**
 * Ask before leaving a page whose beforeunload handler vetoed closing it, as Chrome does.
 * Electron otherwise cancels the close silently. It must answer synchronously, inside
 * `will-prevent-unload`, so the prompt is a modal native dialog.
 */
export function confirmLeave(window: BrowserWindow | null | undefined, title: string): boolean {
  const leave = 0;
  const options: Electron.MessageBoxSyncOptions = {
    type: "question",
    title,
    message: "Leave this page?",
    detail: "Changes you made may not be saved.",
    buttons: ["Leave", "Stay"],
    defaultId: leave,
    cancelId: 1,
    noLink: true,
  };
  const answer =
    window && !window.isDestroyed()
      ? dialog.showMessageBoxSync(window, options)
      : dialog.showMessageBoxSync(options);
  return answer === leave;
}
