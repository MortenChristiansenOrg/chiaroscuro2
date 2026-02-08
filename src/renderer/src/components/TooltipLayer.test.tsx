import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipLayer } from "./TooltipLayer";

describe("TooltipLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders nothing when no tooltip is active", () => {
    const { container } = render(<TooltipLayer />);
    expect(container.innerHTML).toBe("");
  });

  it("shows tooltip after hovering a data-tip element", () => {
    render(
      <div>
        <button type="button" data-tip="Hello tooltip">
          Hover me
        </button>
        <TooltipLayer />
      </div>,
    );

    const btn = screen.getByText("Hover me");
    fireEvent.mouseOver(btn);

    // Not shown before delay
    expect(screen.queryByText("Hello tooltip")).toBeNull();

    // Advance past the 500ms delay
    act(() => vi.advanceTimersByTime(500));

    expect(screen.getByText("Hello tooltip")).toBeTruthy();
  });

  it("hides tooltip on mouseleave", () => {
    render(
      <div>
        <button type="button" data-tip="Bye tooltip">
          Hover me
        </button>
        <TooltipLayer />
      </div>,
    );

    const btn = screen.getByText("Hover me");
    fireEvent.mouseOver(btn);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Bye tooltip")).toBeTruthy();

    fireEvent.mouseLeave(document);
    expect(screen.queryByText("Bye tooltip")).toBeNull();
  });

  it("does not show tooltip if mouse moves away before delay", () => {
    render(
      <div>
        <button type="button" data-tip="No show">
          Hover me
        </button>
        <TooltipLayer />
      </div>,
    );

    const btn = screen.getByText("Hover me");
    fireEvent.mouseOver(btn);

    // Move away before 500ms
    act(() => vi.advanceTimersByTime(200));
    fireEvent.mouseLeave(document);

    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText("No show")).toBeNull();
  });

  it("positions tooltip above when element is near bottom of viewport", () => {
    render(
      <div>
        <button type="button" data-tip="Above me">
          Bottom button
        </button>
        <TooltipLayer />
      </div>,
    );

    const btn = screen.getByText("Bottom button");
    // Mock getBoundingClientRect to simulate element near bottom
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
      top: 750,
      bottom: 780,
      left: 100,
      right: 200,
      width: 100,
      height: 30,
      x: 100,
      y: 750,
      toJSON: () => {},
    });

    // Set viewport height small enough that bottom + 32 > innerHeight
    Object.defineProperty(window, "innerHeight", { value: 800, writable: true });

    fireEvent.mouseOver(btn);
    act(() => vi.advanceTimersByTime(500));

    const tooltip = screen.getByText("Above me");
    // translateY(-100%) means positioned above
    expect(tooltip.style.transform).toContain("translateY(-100%)");
  });

  it("switches tooltip when moving between data-tip elements", () => {
    render(
      <div>
        <button type="button" data-tip="First">
          Btn1
        </button>
        <button type="button" data-tip="Second">
          Btn2
        </button>
        <TooltipLayer />
      </div>,
    );

    fireEvent.mouseOver(screen.getByText("Btn1"));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("First")).toBeTruthy();

    fireEvent.mouseOver(screen.getByText("Btn2"));

    // After delay, new tooltip replaces old
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByText("First")).toBeNull();
  });
});
