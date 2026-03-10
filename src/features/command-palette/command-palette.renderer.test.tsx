import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteOverlay } from "./command-palette.renderer";

afterEach(() => {
  cleanup();
});

describe("CommandPaletteOverlay", () => {
  it("renders nothing (UI is in a native BrowserWindow overlay)", () => {
    const { container } = render(<CommandPaletteOverlay />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
