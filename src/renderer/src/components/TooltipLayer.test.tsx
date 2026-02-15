import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipLayer } from "./TooltipLayer";

// Mock window.chiaroscuro.sendCommand
const mockSendCommand = vi.fn(() => Promise.resolve());
Object.defineProperty(window, "chiaroscuro", {
  value: { sendCommand: mockSendCommand },
  writable: true,
});

describe("TooltipLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSendCommand.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders hidden aria element", () => {
    render(<TooltipLayer />);
    const el = document.querySelector("[role=tooltip]");
    expect(el).toBeTruthy();
    expect(el?.textContent).toBe("");
  });

  it("sends tooltip:show after hovering a data-tip element", () => {
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

    // Not sent before delay
    expect(mockSendCommand).not.toHaveBeenCalledWith("tooltip:show", expect.anything());

    vi.advanceTimersByTime(500);

    expect(mockSendCommand).toHaveBeenCalledWith(
      "tooltip:show",
      expect.objectContaining({ text: "Hello tooltip" }),
    );
  });

  it("sends tooltip:hide on mouseleave", () => {
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
    vi.advanceTimersByTime(500);
    mockSendCommand.mockClear();

    fireEvent.mouseLeave(document);
    expect(mockSendCommand).toHaveBeenCalledWith("tooltip:hide", undefined);
  });

  it("does not send tooltip:show if mouse moves away before delay", () => {
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
    vi.advanceTimersByTime(200);
    fireEvent.mouseLeave(document);

    vi.advanceTimersByTime(500);
    expect(mockSendCommand).not.toHaveBeenCalledWith("tooltip:show", expect.anything());
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
    vi.advanceTimersByTime(500);
    expect(mockSendCommand).toHaveBeenCalledWith(
      "tooltip:show",
      expect.objectContaining({ text: "First" }),
    );

    mockSendCommand.mockClear();
    fireEvent.mouseOver(screen.getByText("Btn2"));
    vi.advanceTimersByTime(500);
    expect(mockSendCommand).toHaveBeenCalledWith(
      "tooltip:show",
      expect.objectContaining({ text: "Second" }),
    );
  });
});
