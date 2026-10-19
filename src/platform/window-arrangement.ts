/**
 * Windows' window keys (Win+arrows), applied to the browser window while a sub-tab page has focus
 * (#129, #134). Windows applies them to the active window, here the sub-tab window, which cannot be
 * snapped, maximized or minimized on its own. Electron has no API for snapping, so this repeats
 * what Windows 11 does with a window's bounds, as measured with its keys on the browser window.
 * Snap Assist and snap groups are Windows' own and are not repeated.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "shift+up"
  | "shift+left"
  | "shift+right";

type Side = "left" | "right";

/** How a window is arranged in the work area of its display. */
export type Arrangement =
  | { kind: "restored" }
  | { kind: "maximized" }
  /** Full work-area height at its own width (Win+Shift+Up). */
  | { kind: "stretched" }
  | { kind: "half"; side: Side }
  | { kind: "quarter"; side: Side; top: boolean };

export type WindowAction =
  | { type: "none" }
  | { type: "minimize" }
  /** Maximize on the display with this work area. */
  | { type: "maximize"; area: Rect }
  /** Back to the bounds the window had before it was arranged. */
  | { type: "restore" }
  | { type: "bounds"; bounds: Rect };

/** Windows leaves a pixel's gap at some edges of a snapped window. */
const TOLERANCE = 2;

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

const sameRect = (a: Rect, b: Rect) =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);

/** The bounds of a half or quarter of a work area. */
export function arrangedBounds(
  area: Rect,
  arrangement: Extract<Arrangement, { kind: "half" | "quarter" }>,
): Rect {
  const leftWidth = Math.floor(area.width / 2);
  const x = arrangement.side === "left" ? area.x : area.x + leftWidth;
  const width = arrangement.side === "left" ? leftWidth : area.width - leftWidth;
  if (arrangement.kind === "half") return { x, y: area.y, width, height: area.height };
  const topHeight = Math.floor(area.height / 2);
  return arrangement.top
    ? { x, y: area.y, width, height: topHeight }
    : { x, y: area.y + topHeight, width, height: area.height - topHeight };
}

/** How a window with these bounds is arranged in a work area. */
export function arrangementOf(bounds: Rect, area: Rect, maximized: boolean): Arrangement {
  if (maximized) return { kind: "maximized" };
  for (const side of ["left", "right"] as const) {
    if (sameRect(bounds, arrangedBounds(area, { kind: "half", side })))
      return { kind: "half", side };
    for (const top of [true, false]) {
      if (sameRect(bounds, arrangedBounds(area, { kind: "quarter", side, top })))
        return { kind: "quarter", side, top };
    }
  }
  if (near(bounds.y, area.y) && near(bounds.height, area.height)) return { kind: "stretched" };
  return { kind: "restored" };
}

const center = (area: Rect) => area.x + area.width / 2;

/**
 * The work area next to this one in a direction. Past the last display, Windows continues from the
 * display at the other end, which is this one if it is the only display.
 */
export function nextArea(areas: readonly Rect[], from: Rect, side: Side): Rect {
  const sign = side === "left" ? -1 : 1;
  const beyond = areas.filter((area) => sign * (center(area) - center(from)) > 0);
  const nearest = (candidates: readonly Rect[], pick: (a: number, b: number) => boolean) =>
    candidates.reduce((best, area) => (pick(center(area), center(best)) ? area : best));
  if (beyond.length) return nearest(beyond, (a, b) => sign * (a - b) < 0);
  // Wrap around to the display furthest the other way.
  return nearest([from, ...areas], (a, b) => sign * (a - b) < 0);
}

/** The same place on another display, as Windows moves a window there (Win+Shift+Left/Right). */
export function moveToArea(bounds: Rect, from: Rect, to: Rect): Rect {
  const width = Math.min(bounds.width, to.width);
  const height = Math.min(bounds.height, to.height);
  const scale = (offset: number, fromSize: number, toSize: number) =>
    fromSize > 0 ? Math.round((offset * toSize) / fromSize) : 0;
  const x = to.x + scale(bounds.x - from.x, from.width, to.width);
  const y = to.y + scale(bounds.y - from.y, from.height, to.height);
  return {
    x: Math.min(Math.max(x, to.x), to.x + to.width - width),
    y: Math.min(Math.max(y, to.y), to.y + to.height - height),
    width,
    height,
  };
}

const opposite = (side: Side): Side => (side === "left" ? "right" : "left");

/** What Windows does with a window for one of its window keys. */
export function windowKeyAction(
  key: WindowKey,
  window: { bounds: Rect; maximized: boolean; area: Rect; areas: readonly Rect[] },
): WindowAction {
  const { bounds, area, areas } = window;
  const arrangement = arrangementOf(bounds, area, window.maximized);
  const place = (target: Extract<Arrangement, { kind: "half" | "quarter" }>, on = area) =>
    ({ type: "bounds", bounds: arrangedBounds(on, target) }) as const;
  switch (key) {
    case "left":
    case "right": {
      if (arrangement.kind === "half") {
        if (arrangement.side !== key) return { type: "restore" };
        // Snapped to this side already: on to the other side of the next display.
        return place({ kind: "half", side: opposite(key) }, nextArea(areas, area, key));
      }
      if (arrangement.kind === "quarter") {
        if (arrangement.side !== key) return place({ ...arrangement, side: key });
        return place({ ...arrangement, side: opposite(key) }, nextArea(areas, area, key));
      }
      return place({ kind: "half", side: key });
    }
    case "up":
      switch (arrangement.kind) {
        case "maximized":
          return { type: "none" };
        case "half":
          return place({ kind: "quarter", side: arrangement.side, top: true });
        case "quarter":
          return arrangement.top
            ? { type: "maximize", area }
            : place({ kind: "half", side: arrangement.side });
        default:
          return { type: "maximize", area };
      }
    case "down":
      switch (arrangement.kind) {
        case "maximized":
        case "stretched":
          return { type: "restore" };
        case "half":
          return place({ kind: "quarter", side: arrangement.side, top: false });
        case "quarter":
          return arrangement.top
            ? place({ kind: "half", side: arrangement.side })
            : { type: "minimize" };
        default:
          return { type: "minimize" };
      }
    case "shift+up":
      if (arrangement.kind === "quarter") return place({ kind: "half", side: arrangement.side });
      if (arrangement.kind !== "restored") return { type: "none" };
      return { type: "bounds", bounds: { ...bounds, y: area.y, height: area.height } };
    case "shift+left":
    case "shift+right": {
      const side = key === "shift+left" ? "left" : "right";
      const to = nextArea(areas, area, side);
      if (sameRect(to, area)) return { type: "none" };
      switch (arrangement.kind) {
        case "maximized":
          return { type: "maximize", area: to };
        case "half":
        case "quarter":
          return place(arrangement, to);
        case "stretched": {
          const moved = moveToArea(bounds, area, to);
          return { type: "bounds", bounds: { ...moved, y: to.y, height: to.height } };
        }
        default:
          return { type: "bounds", bounds: moveToArea(bounds, area, to) };
      }
    }
  }
}

/** The bounds a window returns to when no earlier bounds are known: centered, two thirds in size. */
export function defaultRestoreBounds(area: Rect): Rect {
  const width = Math.round((area.width * 2) / 3);
  const height = Math.round((area.height * 2) / 3);
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}

interface ArrangedWindow {
  getBounds(): Rect;
  setBounds(bounds: Rect): void;
  getNormalBounds(): Rect;
  isMaximized(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  maximize(): void;
  unmaximize(): void;
  minimize(): void;
  on(event: "move" | "resize", listener: () => void): unknown;
}

interface DisplayScreen {
  getDisplayMatching(rect: Rect): { workArea: Rect };
  getAllDisplays(): { workArea: Rect }[];
}

/**
 * Applies window keys to a window. Like Windows, it returns a snapped window to the bounds it had
 * before, so it follows the window's bounds while it is not arranged.
 */
export class WindowArranger {
  private restoreBounds: Rect | undefined;

  constructor(
    private readonly window: ArrangedWindow,
    private readonly screen: DisplayScreen,
  ) {
    this.follow();
    window.on("move", () => this.follow());
    window.on("resize", () => this.follow());
  }

  /** Apply a window key. Returns what was done. */
  press(key: WindowKey): WindowAction["type"] {
    const win = this.window;
    if (win.isMinimized() || win.isFullScreen()) return "none";
    const bounds = win.getBounds();
    const area = this.screen.getDisplayMatching(bounds).workArea;
    const action = windowKeyAction(key, {
      bounds,
      maximized: win.isMaximized(),
      area,
      areas: this.screen.getAllDisplays().map((display) => display.workArea),
    });
    switch (action.type) {
      case "minimize":
        win.minimize();
        break;
      case "maximize":
        if (win.isMaximized()) win.unmaximize();
        if (!sameRect(this.screen.getDisplayMatching(win.getBounds()).workArea, action.area)) {
          const normal = win.getNormalBounds();
          const from = this.screen.getDisplayMatching(normal).workArea;
          win.setBounds(moveToArea(normal, from, action.area));
        }
        win.maximize();
        break;
      case "restore": {
        if (win.isMaximized()) win.unmaximize();
        const current = win.getBounds();
        const currentArea = this.screen.getDisplayMatching(current).workArea;
        if (arrangementOf(current, currentArea, false).kind !== "restored")
          win.setBounds(this.restoreBoundsIn(currentArea));
        break;
      }
      case "bounds":
        if (win.isMaximized()) win.unmaximize();
        win.setBounds(action.bounds);
        break;
    }
    return action.type;
  }

  /** The bounds the window had before it was arranged, on the display it is on now. */
  private restoreBoundsIn(area: Rect): Rect {
    const bounds = this.restoreBounds;
    if (!bounds) return defaultRestoreBounds(area);
    const from = this.screen.getDisplayMatching(bounds).workArea;
    return sameRect(from, area) ? bounds : moveToArea(bounds, from, area);
  }

  private follow(): void {
    const win = this.window;
    if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const bounds = win.getBounds();
    const area = this.screen.getDisplayMatching(bounds).workArea;
    if (arrangementOf(bounds, area, false).kind === "restored") this.restoreBounds = bounds;
  }
}
