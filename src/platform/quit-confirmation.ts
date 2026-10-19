import { logError } from "../shared/log";
import { StayedOnPage } from "./leave-prompt";

/** A page to close before quitting. */
export interface PageToClose<Id> {
  id: Id;
  /** Resolve once the page closed; reject with `StayedOnPage` if the user stays on it. */
  close(): Promise<void>;
}

export interface CloseInTurnOptions {
  /** Longest wait for one page, beyond time spent answering its prompt. */
  pageTimeoutMs: number;
  /** Longest total wait, excluding time spent answering prompts. Later pages are not checked. */
  budgetMs: number;
  /** Total time prompts have been shown so far. */
  promptTime: () => number;
  now?: () => number;
}

export type CloseInTurnResult<Id> =
  | { left: true; closed: Id[] }
  | { left: false; closed: Id[]; stayedOn: Id };

/**
 * Close pages one at a time so each can ask about unsaved changes, as Chrome does on quit.
 * Electron runs a page's beforeunload only by closing it, so pages closed before the user
 * stays are gone; the pages after it are left untouched. A page that does not finish closing
 * in time (a hung renderer) is passed over, and once the budget is spent the rest are not
 * checked, so quitting never hangs on pages. A page passed over may still ask later; staying
 * on it while later pages are checked stops there too.
 */
export async function closePagesInTurn<Id>(
  pages: PageToClose<Id>[],
  { pageTimeoutMs, budgetMs, promptTime, now = Date.now }: CloseInTurnOptions,
): Promise<CloseInTurnResult<Id>> {
  const closed: Id[] = [];
  const start = now();
  const promptsBefore = promptTime();
  // Time spent answering prompts does not count against the budget or a page.
  const waited = () => now() - start - (promptTime() - promptsBefore);
  let stayedLate: { id: Id } | undefined;
  // Read through a function: the page sets it from a callback, between awaits.
  const lateStay = (): { id: Id } | undefined => stayedLate;
  let onStayedLate = () => {};
  const stayedLatePromise = new Promise<"stayed">((resolve) => {
    onStayedLate = () => resolve("stayed");
  });
  const stayed = (id: Id): CloseInTurnResult<Id> => ({ left: false, closed, stayedOn: id });

  for (const page of pages) {
    const late = lateStay();
    if (late) return stayed(late.id);
    if (waited() >= budgetMs) break;
    const pagePrompts = promptTime();
    const pageStart = now();
    const remaining = () =>
      Math.min(
        pageTimeoutMs - (now() - pageStart - (promptTime() - pagePrompts)),
        budgetMs - waited(),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      const check = () => {
        const left = remaining();
        if (left <= 0) resolve("timeout");
        else timer = setTimeout(check, left);
      };
      check();
    });
    const closing = page.close().then(() => "closed" as const);
    try {
      const outcome = await Promise.race([closing, timedOut, stayedLatePromise]);
      if (outcome === "closed") closed.push(page.id);
      else if (outcome === "stayed") return stayed((lateStay() as { id: Id }).id);
      else
        closing.catch((error: unknown) => {
          if (!(error instanceof StayedOnPage) || lateStay()) return;
          stayedLate = { id: page.id };
          onStayedLate();
        });
    } catch (error) {
      if (error instanceof StayedOnPage) return stayed(page.id);
      logError("quit", "close page")(error);
    } finally {
      clearTimeout(timer);
    }
  }
  const late = lateStay();
  if (late) return stayed(late.id);
  return { left: true, closed };
}

/**
 * Whether the browser may close its window or quit, asked once for every attempt. Overlapping
 * requests (quitting while the window is closing) share one answer. Once confirmed, closing
 * proceeds without asking again until `cancel()`.
 */
export class QuitConfirmation {
  private confirmed = false;
  private skipped = false;
  private pending: Promise<boolean> | undefined;

  constructor(private readonly askPages: () => Promise<boolean>) {}

  /** Closing may proceed without asking: confirmed, or asking was skipped. */
  get settled(): boolean {
    return this.confirmed || this.skipped;
  }

  /** Pages are being asked about. */
  get asking(): boolean {
    return this.pending !== undefined;
  }

  /** Resolve whether closing may proceed, asking about pages with unsaved changes first. */
  confirm(): Promise<boolean> {
    if (this.settled) return Promise.resolve(true);
    if (!this.pending) {
      this.pending = this.askPages()
        .catch((error: unknown) => {
          // Never keep the browser from quitting because asking failed.
          logError("quit", "ask about unsaved changes")(error);
          return true;
        })
        .then((leave) => {
          if (leave) this.confirmed = true;
          return leave;
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  }

  /** Quit without asking, for example when the operating system ends the session. */
  skip(): void {
    this.skipped = true;
  }

  /** A confirmed quit did not happen; ask again next time. */
  cancel(): void {
    this.confirmed = false;
    this.skipped = false;
  }
}
