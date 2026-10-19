import { logError } from "../shared/log";
import { StayedOnPage } from "./leave-prompt";

/** A page to close before quitting. */
export interface PageToClose<Id> {
  id: Id;
  /** Resolve once the page closed; reject with `StayedOnPage` if the user stays on it. */
  close(): Promise<void>;
}

export interface CloseInTurnOptions<Id = unknown> {
  /** Longest wait for one page, beyond time spent answering its prompt. */
  pageTimeoutMs: number;
  /** Longest total wait, excluding time spent answering prompts. Later pages are not checked. */
  budgetMs: number;
  /** Total time prompts have been shown so far. */
  promptTime: () => number;
  /**
   * Resolves with a page the user stayed on outside the quit's own prompts, for example when
   * closing its tab. Staying there cancels the quit, as staying in its prompt does.
   */
  stayed?: Promise<Id>;
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
 * on it while later pages are checked stops there too, as does staying on a page elsewhere
 * (`stayed`).
 */
export async function closePagesInTurn<Id>(
  pages: PageToClose<Id>[],
  {
    pageTimeoutMs,
    budgetMs,
    promptTime,
    stayed: stayedElsewhere,
    now = Date.now,
  }: CloseInTurnOptions<Id>,
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
  stayedElsewhere?.then((id) => {
    if (stayedLate) return;
    stayedLate = { id };
    onStayedLate();
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

/** Go back to what was shown before a page was shown to ask about it. */
export type GoBack = () => Promise<void>;

/** A page that may warn about unsaved changes when it is closed. */
export interface PageThatMayWarn {
  /**
   * Close the page without asking. When it warns, `leave` decides whether to leave it anyway;
   * if not, the page is kept and the close rejects with `StayedOnPage`.
   */
  close(leave: () => boolean): Promise<void>;
  /**
   * Show the page to the user, for example by switching to its tab. Must not hang. May return
   * how to go back afterwards, which runs once the user answered, before the page is left.
   */
  show(): Promise<GoBack | undefined>;
  /** Ask the user whether to leave the page. */
  ask(): boolean;
  /** An answer the user already gave about the page elsewhere, so it is not asked again. */
  answered?(): boolean | undefined;
  /** The page is gone, for example because the user closed it meanwhile. */
  closed(): boolean;
}

export interface ShowBeforeAskingOptions {
  /** Quitting was confirmed: leave pages without asking. */
  confirmed: () => boolean;
  /**
   * Pages are still being asked about; false once the user stayed and the quit was cancelled.
   * Always true when the user closes the page.
   */
  asking: () => boolean;
  /** Show and ask about one page at a time. */
  inTurn: <T>(action: () => Promise<T>) => Promise<T>;
}

/**
 * Close a page, and if it warns about unsaved changes, show it before asking about it, as
 * Chrome does. Electron says a page warns only by running its beforeunload, which must be
 * answered at once while nothing can repaint. So the first close keeps a page that warns
 * without asking. The page is then shown and, once it has painted, the user is asked; then
 * `show`'s way back runs, and leaving closes the page again, overriding its warning. A page
 * whose warning ran only once is still asked about. Pages without a warning close on the first
 * attempt at no extra cost. A page answered elsewhere meanwhile (`answered`) is not shown or
 * asked about again. Rejects with `StayedOnPage` if the user stays, or the quit was cancelled
 * before the page was asked about; the page is then kept.
 */
export async function closeShowingWarning(
  page: PageThatMayWarn,
  { confirmed, asking, inTurn }: ShowBeforeAskingOptions,
): Promise<void> {
  let warned = false;
  try {
    await page.close(() => {
      warned = true;
      return confirmed();
    });
    return;
  } catch (error) {
    // Another close of the same page may have asked, and the user stayed there. Another close
    // that kept it without asking leaves it to be asked about here.
    if (!(error instanceof StayedOnPage) || (!warned && error.asked)) throw error;
  }
  await inTurn(async () => {
    if (confirmed() || page.closed() || page.answered?.() === true) return;
    if (page.answered?.() === false || !asking()) throw new StayedOnPage();
    const goBack = await page.show();
    try {
      const answer = page.answered?.();
      if (page.closed() || confirmed() || answer === true) return;
      // The user stayed on this page, or on another one, while it was being shown.
      if (answer === false || !asking() || !page.ask()) throw new StayedOnPage();
    } finally {
      await goBack?.();
    }
  });
  await page.close(() => true);
}

/**
 * Answers the user gave about pages while a quit or window close asks about them, in its own
 * prompts or by closing a tab meanwhile (#151). A page answered once is not asked about again,
 * and staying on any page cancels the quit, as staying in the quit's own prompt does.
 */
export class QuitAnswers<Id> {
  private readonly answers = new WeakMap<object, boolean>();
  private stayedOn: { id: Id } | undefined;
  private onStay: (id: Id) => void = () => {};
  /** Resolves with the first page the user stayed on. */
  readonly stayed = new Promise<Id>((resolve) => {
    this.onStay = resolve;
  });

  /** The user stayed on a page, so the quit is cancelled. */
  get cancelled(): boolean {
    return this.stayedOn !== undefined;
  }

  /** The answer given about a page, if it was asked about: true when the user left it. */
  answer(page: object): boolean | undefined {
    return this.answers.get(page);
  }

  /** Ask whether to leave a page unless the user already answered, and keep the answer. */
  ask(page: object, id: Id, ask: () => boolean): boolean {
    const known = this.answers.get(page);
    if (known !== undefined) return known;
    const leave = ask();
    this.answers.set(page, leave);
    if (!leave && !this.stayedOn) {
      this.stayedOn = { id };
      this.onStay(id);
    }
    return leave;
  }
}

/**
 * Run actions one at a time, in the order they were requested. An action that takes longer
 * than `timeoutMs`, beyond time spent showing pages and answering prompts (`promptTime`), no
 * longer holds up the next one, so a hung page cannot stop the others. Time a prompt blocks
 * the process is excluded, so an action is not passed over while it waits on a prompt and
 * then shows its page under the next action's prompt.
 */
export function oneAtATime(
  timeoutMs: number,
  promptTime: () => number = () => 0,
  now: () => number = Date.now,
): <T>(action: () => Promise<T>) => Promise<T> {
  let previous: Promise<void> = Promise.resolve();
  return <T>(action: () => Promise<T>) => {
    const result = previous.then(action);
    previous = previous.then(
      () =>
        new Promise<void>((resolve) => {
          const start = now();
          const promptsBefore = promptTime();
          let timer: ReturnType<typeof setTimeout> | undefined;
          const check = () => {
            const left = timeoutMs - (now() - start - (promptTime() - promptsBefore));
            if (left <= 0) resolve();
            else timer = setTimeout(check, left);
          };
          check();
          result
            .finally(() => {
              clearTimeout(timer);
              resolve();
            })
            .catch(() => {});
        }),
    );
    return result;
  };
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
