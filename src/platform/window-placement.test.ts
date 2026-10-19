import { expect, it } from "vitest";
import { fitToWorkArea } from "./window-placement";

const left = { x: 0, y: 0, width: 1920, height: 1040 };
const right = { x: 1920, y: -200, width: 1280, height: 1000 };

it("keeps bounds that already fit a work area", () => {
  const bounds = { x: 100, y: 100, width: 380, height: 630 };
  expect(fitToWorkArea(bounds, [left, right])).toEqual(bounds);
});

it("moves bounds that cross a work area's edge back inside it", () => {
  expect(fitToWorkArea({ x: 1700, y: 900, width: 380, height: 630 }, [left])).toEqual({
    x: 1540,
    y: 410,
    width: 380,
    height: 630,
  });
});

it("fits bounds to the display they overlap most", () => {
  expect(fitToWorkArea({ x: 1800, y: -100, width: 380, height: 630 }, [left, right])).toEqual({
    x: 1920,
    y: -100,
    width: 380,
    height: 630,
  });
});

it("fits bounds off every display to the display nearest their centre", () => {
  expect(fitToWorkArea({ x: 4000, y: -900, width: 380, height: 630 }, [left, right])).toEqual({
    x: 2820,
    y: -200,
    width: 380,
    height: 630,
  });
  expect(fitToWorkArea({ x: -900, y: 2000, width: 380, height: 630 }, [left, right])).toEqual({
    x: 0,
    y: 410,
    width: 380,
    height: 630,
  });
});

it("shrinks bounds larger than the work area", () => {
  expect(fitToWorkArea({ x: 2000, y: 0, width: 4000, height: 4000 }, [left, right])).toEqual(right);
});

it("leaves bounds alone without any display", () => {
  const bounds = { x: -5000, y: 0, width: 380, height: 630 };
  expect(fitToWorkArea(bounds, [])).toEqual(bounds);
});
