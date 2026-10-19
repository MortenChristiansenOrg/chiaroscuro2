import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ dialog: {} }));

import { StayedOnPage } from "./leave-prompt";
import { closePagesInTurn, type PageToClose, QuitConfirmation } from "./quit-confirmation";

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
