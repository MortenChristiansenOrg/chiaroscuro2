interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FullScreenView {
  getBounds(): Rect;
  setBounds(bounds: Rect): void;
  setBorderRadius(radius: number): void;
}

export interface FullScreenOverlay {
  setBounds(bounds: Rect): void;
}

export interface FullScreenWindow {
  getContentBounds(): Rect;
  setFullScreen(fullScreen: boolean): void;
  on(event: "resize" | "enter-full-screen", listener: () => void): unknown;
  removeListener(event: "resize" | "enter-full-screen", listener: () => void): unknown;
}

interface ActivePage<V> {
  view: V;
  /** Where the tabs and sub-tabs features want the view once the page leaves full screen. */
  bounds: Rect;
  /** The sub-tab window when the view lives there. It covers only the content area otherwise. */
  overlay?: FullScreenOverlay;
  exitPage: () => void;
  stopFollowing: () => void;
}

const DEFAULT_RADIUS = 8;

/**
 * Lets a page that asked for full screen (a video, for example) cover the browser window. Electron
 * only makes the window itself full screen, which would leave the sidebar and top bar in view.
 */
export class PageFullScreen<V extends FullScreenView> {
  private active: ActivePage<V> | undefined;
  private readonly radii = new WeakMap<V, number>();

  constructor(
    private readonly browserWindow: () => FullScreenWindow | undefined,
    private readonly onRestored: () => void,
  ) {}

  get isActive(): boolean {
    return this.active !== undefined;
  }

  get coversOverlay(): boolean {
    return this.active?.overlay !== undefined;
  }

  /** The page entered full screen. Electron has already done so for the window that holds its view. */
  enter(view: V, options: { overlay?: FullScreenOverlay; exitPage: () => void }): void {
    if (this.active?.view === view) return;
    // The window stays full screen for the page taking over.
    this.restore({ keepWindow: true });
    const win = this.browserWindow();
    if (!win) return;
    const fill = () => this.fill();
    win.on("resize", fill);
    // Some window managers finish resizing before Electron reports the new size.
    win.on("enter-full-screen", fill);
    this.active = {
      view,
      bounds: view.getBounds(),
      overlay: options.overlay,
      exitPage: options.exitPage,
      stopFollowing: () => {
        win.removeListener("resize", fill);
        win.removeListener("enter-full-screen", fill);
      },
    };
    // The sub-tab window sits on top of the browser window and can't be full screen by itself.
    if (options.overlay) win.setFullScreen(true);
    view.setBorderRadius(0);
    this.fill();
  }

  /** The page left full screen by itself, for example on Escape. */
  left(view: V): void {
    if (this.active?.view === view) this.restore();
  }

  /** Take the view out of full screen because the page can no longer be shown as it is. */
  exit(view?: V): void {
    const active = this.active;
    if (!active || (view && active.view !== view)) return;
    this.restore();
    this.browserWindow()?.setFullScreen(false);
    active.exitPage();
  }

  /** The view is gone, so its page can't report leaving full screen. */
  closed(view: V): void {
    if (this.active?.view !== view) return;
    this.restore();
    this.browserWindow()?.setFullScreen(false);
  }

  /** Remember bounds for a full-screen view instead of applying them. False for any other view. */
  holdBounds(view: V, bounds: Rect): boolean {
    if (this.active?.view !== view) return false;
    this.active.bounds = bounds;
    // The shell lays out again once the window has its new size, which catches a late resize.
    this.fill();
    return true;
  }

  setBorderRadius(view: V, radius: number): void {
    this.radii.set(view, radius);
    if (this.active?.view !== view) view.setBorderRadius(radius);
  }

  private fill(): void {
    const active = this.active;
    const area = this.browserWindow()?.getContentBounds();
    if (!active || !area) return;
    active.overlay?.setBounds(area);
    active.view.setBounds({ x: 0, y: 0, width: area.width, height: area.height });
  }

  private restore({ keepWindow = false } = {}): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    active.stopFollowing();
    active.view.setBounds(active.bounds);
    active.view.setBorderRadius(this.radii.get(active.view) ?? DEFAULT_RADIUS);
    if (active.overlay && !keepWindow) this.browserWindow()?.setFullScreen(false);
    this.onRestored();
  }
}
