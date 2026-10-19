import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ dialog: {} }));

import { StayedOnPage } from "./leave-prompt";
import {
  closePagesInTurn,
  closeShowingWarning,
  oneAtATime,
  type PageToClose,
  QuitConfirmation,
} from "./quit-confirmation";

describe("closing pages in turn before quitting", () => {
  let promptMs = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    promptMs = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const options = () => ({
    pageTimeoutMs: 3_000,
    budgetMs: 5_000,
    promptTime: () => promptMs,
  });
  const closes = (id: string, close: () => Promise<void> = async () => {}) => ({
    id,
    close: vi.fn(close),
  });
  const hangs = (id: string) => closes(id, () => new Promise<void>(() => {}));
  const stays = (id: string) =>
    closes(id, async () => {
      throw new StayedOnPage();
    });

  it("closes every page one at a time when the user leaves them all", async () => {
    const order: string[] = [];
    let open = 0;
    const page = (id: string): PageToClose<string> =>
      closes(id, async () => {
        open++;
        expect(open).toBe(1);
        order.push(id);
        await Promise.resolve();
        open--;
      });
    const result = await closePagesInTurn([page("a"), page("b"), page("c")], options());
    expect(result).toEqual({ left: true, closed: ["a", "b", "c"] });
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("stops at the page the user stays on and leaves the rest untouched", async () => {
    const later = closes("c");
    const result = await closePagesInTurn([closes("a"), stays("b"), later], options());
    expect(result).toEqual({ left: false, closed: ["a"], stayedOn: "b" });
    expect(later.close).not.toHaveBeenCalled();
  });

  it("passes over a page that does not finish closing", async () => {
    const next = closes("b");
    const result = closePagesInTurn([hangs("a"), next], options());
    await vi.advanceTimersByTimeAsync(2_999);
    expect(next.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    // A page that did not close is not reported as closed.
    await expect(result).resolves.toEqual({ left: true, closed: ["b"] });
  });

  it("does not count time spent answering a prompt against the page", async () => {
    let finish = () => {};
    const page = closes(
      "a",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const result = closePagesInTurn([page], options());
    await vi.advanceTimersByTimeAsync(500);
    // The user takes a minute to answer, then the page takes a while to finish closing.
    promptMs += 60_000;
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(2_000);
    finish();
    await expect(result).resolves.toEqual({ left: true, closed: ["a"] });
  });

  it("stops checking pages once the budget is spent and lets the quit proceed", async () => {
    const pages = [hangs("a"), hangs("b"), closes("c")];
    const result = closePagesInTurn(pages, options());
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(result).resolves.toEqual({ left: true, closed: [] });
    expect(pages[2]?.close).not.toHaveBeenCalled();
  });

  it("never waits on pages longer than the budget in total", async () => {
    const pages = [hangs("a"), hangs("b")];
    const result = closePagesInTurn(pages, options());
    await vi.advanceTimersByTimeAsync(4_999);
    expect(pages[1]?.close).toHaveBeenCalled();
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ left: true, closed: [] });
  });

  it("stops when the user stays on a page that asked after it was passed over", async () => {
    let stayLate = () => {};
    const slow = closes(
      "a",
      () =>
        new Promise<void>((_, reject) => {
          stayLate = () => reject(new StayedOnPage());
        }),
    );
    const later = closes("c");
    const result = closePagesInTurn([slow, hangs("b"), later], options());
    await vi.advanceTimersByTimeAsync(3_000);
    // Page a finally asks while page b is being closed, and the user stays.
    stayLate();
    await expect(result).resolves.toEqual({ left: false, closed: [], stayedOn: "a" });
    expect(later.close).not.toHaveBeenCalled();
  });

  it("continues past a page that fails to close", async () => {
    const failing = closes("a", async () => {
      throw new Error("native close failed");
    });
    await expect(closePagesInTurn([failing, closes("b")], options())).resolves.toEqual({
      left: true,
      closed: ["b"],
    });
  });
});

// #140: as Chrome does, a page that warns is shown before it is asked about.
describe("showing a page before asking about it", () => {
  let confirmed = false;
  let asking = true;
  beforeEach(() => {
    confirmed = false;
    asking = true;
  });
  const options = (inTurn = oneAtATime(3_000)) => ({
    confirmed: () => confirmed,
    asking: () => asking,
    inTurn,
  });

  /**
   * A page whose beforeunload warns when `warns` is true (only the first time when `once`),
   * and whose prompt answers `leaves`.
   */
  function page({ warns = true, once = false, leaves = true } = {}) {
    const steps: string[] = [];
    let open = true;
    let warnings = 0;
    return {
      steps,
      isOpen: () => open,
      closed: () => !open,
      close: vi.fn(async (leave: () => boolean) => {
        steps.push("close");
        if (warns && !(once && warnings > 0)) {
          warnings++;
          if (!leave()) throw new StayedOnPage();
        }
        open = false;
      }),
      show: vi.fn(async () => {
        steps.push("show");
      }),
      ask: vi.fn(() => {
        steps.push(leaves ? "leave" : "stay");
        return leaves;
      }),
    };
  }

  it("closes a page that does not warn at once, without showing it", async () => {
    const quiet = page({ warns: false });
    await closeShowingWarning(quiet, options());
    expect(quiet.steps).toEqual(["close"]);
    expect(quiet.isOpen()).toBe(false);
  });

  it("keeps a page that warns, shows it, asks, then closes it", async () => {
    const warning = page();
    await closeShowingWarning(warning, options());
    expect(warning.steps).toEqual(["close", "show", "leave", "close"]);
    expect(warning.isOpen()).toBe(false);
  });

  it("keeps a page the user stays on", async () => {
    const warning = page({ leaves: false });
    await expect(closeShowingWarning(warning, options())).rejects.toBeInstanceOf(StayedOnPage);
    expect(warning.steps).toEqual(["close", "show", "stay"]);
    expect(warning.isOpen()).toBe(true);
  });

  it("asks about a page whose warning runs only once", async () => {
    const warning = page({ once: true, leaves: false });
    await expect(closeShowingWarning(warning, options())).rejects.toBeInstanceOf(StayedOnPage);
    expect(warning.steps).toEqual(["close", "show", "stay"]);
    expect(warning.isOpen()).toBe(true);
  });

  it("keeps a page without asking when the quit was cancelled while it was shown", async () => {
    const warning = page();
    warning.show.mockImplementationOnce(async () => {
      warning.steps.push("show");
      asking = false;
    });
    await expect(closeShowingWarning(warning, options())).rejects.toBeInstanceOf(StayedOnPage);
    expect(warning.steps).toEqual(["close", "show"]);
    expect(warning.isOpen()).toBe(true);
  });

  it("leaves a page without asking when quitting was confirmed while it was shown", async () => {
    const warning = page();
    warning.show.mockImplementationOnce(async () => {
      warning.steps.push("show");
      confirmed = true;
    });
    await closeShowingWarning(warning, options());
    expect(warning.steps).toEqual(["close", "show", "close"]);
    expect(warning.isOpen()).toBe(false);
  });

  it("does not ask about a page that was closed while it was shown", async () => {
    let open = true;
    const warning = { ...page(), closed: () => !open };
    warning.show.mockImplementationOnce(async () => {
      open = false;
    });
    await closeShowingWarning(warning, options());
    expect(warning.ask).not.toHaveBeenCalled();
  });

  it("leaves a page without showing or asking once quitting is confirmed", async () => {
    confirmed = true;
    const warning = page();
    await closeShowingWarning(warning, options());
    expect(warning.steps).toEqual(["close"]);
    expect(warning.isOpen()).toBe(false);
  });

  it("leaves a page that warned without asking when quitting was confirmed meanwhile", async () => {
    const warning = page();
    const inTurn = <T>(action: () => Promise<T>) => {
      confirmed = true;
      return action();
    };
    await closeShowingWarning(warning, options(inTurn));
    expect(warning.steps).toEqual(["close", "close"]);
    expect(warning.isOpen()).toBe(false);
  });

  it("keeps a page that warned without asking when the quit was cancelled meanwhile", async () => {
    const warning = page();
    asking = false;
    await expect(closeShowingWarning(warning, options())).rejects.toBeInstanceOf(StayedOnPage);
    expect(warning.steps).toEqual(["close"]);
    expect(warning.isOpen()).toBe(true);
  });

  it("does not ask again about a page the user stayed on from another close", async () => {
    const shared = page();
    // The page was already being closed elsewhere, which asked; the user stayed.
    shared.close.mockRejectedValueOnce(new StayedOnPage());
    await expect(closeShowingWarning(shared, options())).rejects.toBeInstanceOf(StayedOnPage);
    expect(shared.show).not.toHaveBeenCalled();
    expect(shared.ask).not.toHaveBeenCalled();
  });

  it("shows and asks about one page at a time", async () => {
    const inTurn = oneAtATime(3_000);
    const first = page();
    let shown = () => {};
    first.show.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          first.steps.push("show");
          shown = resolve;
        }),
    );
    const second = page();
    const closing = [
      closeShowingWarning(first, options(inTurn)),
      closeShowingWarning(second, options(inTurn)),
    ];
    await vi.waitFor(() => expect(first.show).toHaveBeenCalled());
    // The second page warned too, but waits until the first was asked about.
    expect(second.steps).toEqual(["close"]);
    shown();
    await Promise.all(closing);
    expect(first.steps).toEqual(["close", "show", "leave", "close"]);
    expect(second.steps).toEqual(["close", "show", "leave", "close"]);
  });
});

describe("one at a time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs actions in turn, even after one fails", async () => {
    const inTurn = oneAtATime(1_000);
    const order: string[] = [];
    const failing = inTurn(async () => {
      order.push("a");
      throw new Error("broken");
    });
    const next = inTurn(async () => {
      order.push("b");
      return "b";
    });
    await expect(failing).rejects.toThrow("broken");
    await expect(next).resolves.toBe("b");
    expect(order).toEqual(["a", "b"]);
  });

  it("keeps waiting on an action while a prompt is open", async () => {
    vi.useFakeTimers();
    let prompts = 0;
    const inTurn = oneAtATime(1_000, () => prompts);
    void inTurn(() => new Promise<void>(() => {}));
    const next = vi.fn(async () => {});
    const result = inTurn(next);
    await vi.advanceTimersByTimeAsync(500);
    // A prompt was open for 2 seconds.
    prompts += 2_000;
    await vi.advanceTimersByTimeAsync(2_499);
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(next).toHaveBeenCalled();
  });

  it("stops waiting on an action that hangs", async () => {
    vi.useFakeTimers();
    const inTurn = oneAtATime(1_000);
    void inTurn(() => new Promise<void>(() => {}));
    const next = vi.fn(async () => {});
    const result = inTurn(next);
    await vi.advanceTimersByTimeAsync(999);
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(next).toHaveBeenCalled();
  });
});

describe("quit confirmation", () => {
  it("asks once for overlapping requests and not again once confirmed", async () => {
    let answer: (leave: boolean) => void = () => {};
    const ask = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const confirmation = new QuitConfirmation(ask);
    const closing = confirmation.confirm();
    const quitting = confirmation.confirm();
    expect(confirmation.asking).toBe(true);
    answer(true);
    await expect(closing).resolves.toBe(true);
    await expect(quitting).resolves.toBe(true);
    expect(confirmation.settled).toBe(true);
    expect(confirmation.asking).toBe(false);
    await expect(confirmation.confirm()).resolves.toBe(true);
    expect(ask).toHaveBeenCalledOnce();
  });

  it("asks again after the user stayed", async () => {
    const ask = vi.fn(async () => false);
    const confirmation = new QuitConfirmation(ask);
    await expect(confirmation.confirm()).resolves.toBe(false);
    expect(confirmation.settled).toBe(false);
    await confirmation.confirm();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("asks again after a confirmed quit was cancelled", async () => {
    const ask = vi.fn(async () => true);
    const confirmation = new QuitConfirmation(ask);
    await confirmation.confirm();
    confirmation.cancel();
    expect(confirmation.settled).toBe(false);
    await confirmation.confirm();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("quits without asking when asking is skipped", async () => {
    const ask = vi.fn(async () => false);
    const confirmation = new QuitConfirmation(ask);
    confirmation.skip();
    expect(confirmation.settled).toBe(true);
    await expect(confirmation.confirm()).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("never keeps the browser from quitting because asking failed", async () => {
    const confirmation = new QuitConfirmation(async () => {
      throw new Error("broken");
    });
    await expect(confirmation.confirm()).resolves.toBe(true);
    expect(confirmation.settled).toBe(true);
  });
});
