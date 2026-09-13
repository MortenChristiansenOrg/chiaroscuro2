import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bounds } from "../shared/types";
import { TabBoundsAnimation } from "./tab-bounds-animation";

const from = { x: 40, y: 40, width: 880, height: 660 };
const to = { x: 0, y: 0, width: 1000, height: 750 };
function fixture() {
  let bounds = from;
  const view = {
    getBounds: () => bounds,
    setBounds: vi.fn((next: Bounds) => {
      bounds = next;
    }),
  };
  return { view, animation: new TabBoundsAnimation() };
}

describe("sub-tab bounds fallback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("preserves centered geometry and completes at 200 ms", async () => {
    const { view, animation } = fixture();
    const done = vi.fn();
    const result = animation.animate(view, from, to, 200).then(done);
    await vi.advanceTimersByTimeAsync(199);
    expect(done).not.toHaveBeenCalled();
    expect(view.getBounds().width).toBeGreaterThan(from.width);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(view.getBounds()).toEqual(to);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles an interrupted enter and starts exit at the visible bounds", async () => {
    const { view, animation } = fixture();
    const enter = animation.animate(view, from, to, 200);
    await vi.advanceTimersByTimeAsync(64);
    const middle = view.getBounds();
    const exit = animation.animate(view, to, from, 200);
    await enter;
    expect(view.getBounds()).toEqual(middle);
    await vi.advanceTimersByTimeAsync(200);
    await exit;
    expect(view.getBounds()).toEqual(from);
  });

  it("does not overwrite resize, hide or detach geometry after cancellation", async () => {
    const { view, animation } = fixture();
    for (const bounds of [
      { ...to, width: 500 },
      { x: 0, y: 0, width: 0, height: 0 },
    ]) {
      const result = animation.animate(view, from, to, 200);
      await vi.advanceTimersByTimeAsync(64);
      animation.cancel(view);
      view.setBounds(bounds);
      await result;
      await vi.advanceTimersByTimeAsync(300);
      expect(view.getBounds()).toEqual(bounds);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("rejects and clears scheduled work when a native bounds update fails", async () => {
    const { view, animation } = fixture();
    const result = animation.animate(view, from, to, 200);
    const rejection = expect(result).rejects.toThrow("native view gone");
    view.setBounds.mockImplementationOnce(() => {
      throw new Error("native view gone");
    });
    await vi.advanceTimersByTimeAsync(16);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    // A new transition must not try to read stale geometry from a retained entry.
    view.getBounds = () => {
      throw new Error("stale geometry");
    };
    const next = animation.animate(view, from, to, 200);
    animation.cancel(view);
    await next;
  });

  it("applies reduced-motion bounds immediately without a timer", async () => {
    const { view, animation } = fixture();
    await animation.animate(view, from, to, 0);
    expect(view.getBounds()).toEqual(to);
    expect(vi.getTimerCount()).toBe(0);
  });
});
