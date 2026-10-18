import type { ElectronApplication, Page } from "playwright";

type Record = { leavePrompts?: { title?: string; message: string }[]; leaveAnswers?: boolean[] };

/**
 * Answer the native "Leave this page?" prompt with each answer in turn (true leaves), staying
 * once they run out, and start recording the prompts shown.
 */
export function answerLeavePrompts(app: ElectronApplication, answers: boolean[]): Promise<void> {
  return app.evaluate(({ dialog }, answers) => {
    const record = globalThis as unknown as Record;
    record.leavePrompts = [];
    record.leaveAnswers = [...answers];
    dialog.showMessageBoxSync = ((...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxSyncOptions;
      record.leavePrompts?.push({ title: options.title, message: options.message });
      return record.leaveAnswers?.shift() ? 0 : 1;
    }) as typeof dialog.showMessageBoxSync;
  }, answers);
}

/** The leave prompts shown since `answerLeavePrompts`. */
export function leavePrompts(app: ElectronApplication) {
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
