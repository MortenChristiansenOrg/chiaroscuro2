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
  return mockLeavePrompts(app, { answers, stayOn: [] });
}

/**
 * Answer the native "Leave this page?" prompt by page: stay on pages whose address ends with
 * `/` and one of `stayOn`, and leave the others. While the first prompt is open, `click` is
 * clicked in the browser window, as a user would right after answering it.
 */
export function answerLeavePromptsByPage(
  app: ElectronApplication,
  stayOn: string[],
  click?: string,
): Promise<void> {
  return mockLeavePrompts(app, { stayOn, click });
}

function mockLeavePrompts(
  app: ElectronApplication,
  options: { answers?: boolean[]; stayOn: string[]; click?: string },
): Promise<void> {
  return app.evaluate(({ BrowserWindow, dialog, WebContentsView }, { answers, stayOn, click }) => {
    const record = globalThis as unknown as Record;
    record.leavePrompts = [];
    record.leaveAnswers = answers && [...answers];
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
      if (click && record.leavePrompts?.length === 1) {
        // Runs in the browser window once the prompt is answered and the process is free.
        void BrowserWindow.getAllWindows()
          .find((win) => !win.getParentWindow())
          ?.webContents.executeJavaScript(
            `document.querySelector(${JSON.stringify(click)})?.click()`,
          );
      }
      if (record.leaveAnswers) return record.leaveAnswers.shift() ? 0 : 1;
      const address = options.detail?.split("\n")[1] ?? "";
      return stayOn.some((page) => address.endsWith(`/${page}`)) ? 1 : 0;
    }) as typeof dialog.showMessageBoxSync;
  }, options);
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
