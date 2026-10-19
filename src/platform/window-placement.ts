import type { Rectangle } from "electron";

const overlap = (a: Rectangle, b: Rectangle) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Distance from a point to the nearest point of a rectangle. */
const distance = (x: number, y: number, area: Rectangle) =>
  Math.hypot(
    Math.max(area.x - x, 0, x - (area.x + area.width)),
    Math.max(area.y - y, 0, y - (area.y + area.height)),
  );

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Fit window bounds inside the work area of the display they overlap most (or, off every
 * display, the display nearest their centre), shrinking them if they are larger, so an
 * extension cannot place a window where the user cannot reach it.
 */
export function fitToWorkArea(bounds: Rectangle, workAreas: Rectangle[]): Rectangle {
  const centreX = bounds.x + bounds.width / 2,
    centreY = bounds.y + bounds.height / 2;
  const area = workAreas.reduce<Rectangle | undefined>((best, area) => {
    if (!best) return area;
    const difference = overlap(bounds, area) - overlap(bounds, best);
    if (difference !== 0) return difference > 0 ? area : best;
    return distance(centreX, centreY, area) < distance(centreX, centreY, best) ? area : best;
  }, undefined);
  if (!area) return bounds;
  const width = Math.min(bounds.width, area.width),
    height = Math.min(bounds.height, area.height);
  return {
    x: clamp(bounds.x, area.x, area.x + area.width - width),
    y: clamp(bounds.y, area.y, area.y + area.height - height),
    width,
    height,
  };
}
