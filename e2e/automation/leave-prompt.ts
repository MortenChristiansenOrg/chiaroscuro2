import type { ElectronApplication, Page } from "playwright";

/** A leave prompt as shown, with the addresses of the pages visible behind it. */
export interface LeavePromptShown {
  title?: string;
  message: string;
  detail?: string;
  shown: string[];
}

type Record = { leavePrompts?: LeavePromptShown[]; leaveAnswers?: boolean[] };

/**
 * Answer the native "Leave this page?" prompt with each answer in turn (true leaves), staying
 * once they run out, and start recording the prompts shown.
 */
export function answerLeavePrompts(app: ElectronApplication, answers: boolean[]): Promise<void> {
  return app.evaluate(({ BrowserWindow, dialog, WebContentsView }, answers) => {
    const record = globalThis as unknown as Record;
    record.leavePrompts = [];
    record.leaveAnswers = [...answers];
    dialog.showMessageBoxSync = ((...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxSyncOptions;
      // Pages the user can see while the prompt is open: the window cannot repaint then.
      const visible = BrowserWindow.getAllWindows().filter(
        (win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized(),
      );
      const shown = [
        // Pop-up windows show their page in the window itself.
        ...visible.map((win) => win.webContents.getURL()).filter((url) => url.startsWith("http")),
        ...visible
          .flatMap((win) => win.contentView.children)
          .filter((view): view is Electron.WebContentsView => view instanceof WebContentsView)
          .filter((view) => view.getBounds().width > 0 && view.getBounds().height > 0)
          .map((view) => view.webContents.getURL()),
      ];
      record.leavePrompts?.push({
        title: options.title,
        message: options.message,
        detail: options.detail,
        shown,
      });
      return record.leaveAnswers?.shift() ? 0 : 1;
    }) as typeof dialog.showMessageBoxSync;
  }, answers);
}

/** The leave prompts shown since `answerLeavePrompts`. */
export async function leavePrompts(app: ElectronApplication) {
  return (await leavePromptsShown(app)).map(({ title, message }) => ({ title, message }));
}

/** The leave prompts shown since `answerLeavePrompts`, with what they said and showed. */
export function leavePromptsShown(app: ElectronApplication): Promise<LeavePromptShown[]> {
  return app.evaluate(() => (globalThis as unknown as Record).leavePrompts ?? []);
}

/** Warn about unsaved changes, as an edited form does. */
export async function warnBeforeUnload(page: Page): Promise<void> {
  // Electron answers beforeunload through will-prevent-unload; Playwright's automatic
  // dialog dismissal would race that native decision.
  page.on("dialog", () => {});
  await page.evaluate(() =>
    addEventListener("beforeunload", (event) => {
      event.preventDefault();
      event.returnValue = "";
    }),
  );
}
