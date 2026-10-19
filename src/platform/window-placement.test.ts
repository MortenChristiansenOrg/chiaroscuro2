import { expect, it } from "vitest";
import { fitToDisplay } from "./window-placement";

// A bottom taskbar on the left display; the right display sits higher and has none.
const left = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const right = {
  bounds: { x: 1920, y: -200, width: 1280, height: 1000 },
  workArea: { x: 1920, y: -200, width: 1280, height: 1000 },
};

it("keeps bounds that already fit a work area", () => {
  const bounds = { x: 100, y: 100, width: 380, height: 630 };
  expect(fitToDisplay(bounds, [left, right])).toEqual(bounds);
});

it("moves bounds that cross a work area's edge back inside it", () => {
  expect(fitToDisplay({ x: 1700, y: 900, width: 380, height: 630 }, [left])).toEqual({
    x: 1540,
    y: 410,
    width: 380,
    height: 630,
  });
});

it("fits bounds to the display they overlap most", () => {
  expect(fitToDisplay({ x: 1800, y: -100, width: 380, height: 630 }, [left, right])).toEqual({
    x: 1920,
    y: -100,
    width: 380,
    height: 630,
  });
});

it("chooses the display by its whole area, not only its work area", () => {
  const below = {
    bounds: { x: 1920, y: 1040, width: 1920, height: 1080 },
    workArea: { x: 1920, y: 1040, width: 1920, height: 1080 },
  };
  // Mostly over the left display's taskbar, a little over the display below and to the right.
  expect(fitToDisplay({ x: 1800, y: 1045, width: 150, height: 30 }, [left, below])).toEqual({
    x: 1770,
    y: 1010,
    width: 150,
    height: 30,
  });
});

it("fits bounds off every display to the display nearest their centre", () => {
  expect(fitToDisplay({ x: 4000, y: -900, width: 380, height: 630 }, [left, right])).toEqual({
    x: 2820,
    y: -200,
    width: 380,
    height: 630,
  });
  expect(fitToDisplay({ x: -900, y: 2000, width: 380, height: 630 }, [left, right])).toEqual({
    x: 0,
    y: 410,
    width: 380,
    height: 630,
  });
});

it("shrinks bounds larger than the work area", () => {
  expect(fitToDisplay({ x: 2000, y: 0, width: 4000, height: 4000 }, [left, right])).toEqual(
    right.workArea,
  );
});

it("leaves bounds alone without any display", () => {
  const bounds = { x: -5000, y: 0, width: 380, height: 630 };
  expect(fitToDisplay(bounds, [])).toEqual(bounds);
});
