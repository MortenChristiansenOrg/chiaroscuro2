import { logError } from "./log";

/**
 * Wraps a value with auto-debounced persistence. Call `set()` or `update()`
 * to change the value and schedule a save. Call `flush()` on quit to persist
 * immediately. The save callback receives the current value.
 */
export class DebouncedSave<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private value: T,
    private save: (value: T) => Promise<void>,
    private debounceMs = 500,
  ) {}

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    this.schedule();
  }

  update(fn: (prev: T) => T): void {
    this.value = fn(this.value);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.save(this.value).catch(logError("debounced-save", "persist"));
    }, this.debounceMs);
  }

  flush(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.save(this.value).catch(logError("debounced-save", "persist"));
    }
  }
}
