import type { Bounds } from "../shared/types";

interface BoundsView {
  getBounds(): Bounds;
  setBounds(bounds: Bounds): void;
}

/** Timer fallback until native View animations can be safely interrupted (issue #42). */
export class TabBoundsAnimation {
  private pending = new Map<BoundsView, () => void>();

  cancel(view: BoundsView): void {
    this.pending.get(view)?.();
  }

  animate(view: BoundsView, from: Bounds, to: Bounds, duration: number): Promise<void> {
    // An interrupted transition starts at the actual displayed geometry.
    const startBounds = this.pending.has(view) ? view.getBounds() : from;
    this.cancel(view);
    if (duration <= 0) {
      view.setBounds(to);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        clearTimeout(timer);
        this.pending.delete(view);
        resolve();
      };
      this.pending.set(view, finish);
      const start = performance.now();
      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1);
        const eased = 1 - (1 - t) ** 2;
        try {
          view.setBounds({
            x: Math.round(startBounds.x + (to.x - startBounds.x) * eased),
            y: Math.round(startBounds.y + (to.y - startBounds.y) * eased),
            width: Math.max(
              1,
              Math.round(startBounds.width + (to.width - startBounds.width) * eased),
            ),
            height: Math.max(
              1,
              Math.round(startBounds.height + (to.height - startBounds.height) * eased),
            ),
          });
        } catch (error) {
          clearTimeout(timer);
          this.pending.delete(view);
          reject(error);
          return;
        }
        if (t < 1)
          timer = setTimeout(
            tick,
            Math.max(1, Math.min(16, duration - (performance.now() - start))),
          );
        else finish();
      };
      tick();
    });
  }
}
