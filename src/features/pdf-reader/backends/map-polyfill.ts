// Polyfill Map.prototype.getOrInsertComputed — pdfjs-dist v5.5+ uses it,
// but Electron 40 (Chromium 144) doesn't support it yet.
// This must be a separate module imported BEFORE pdfjs-dist so ES module
// evaluation order guarantees it runs first.
// biome-ignore lint/complexity/noBannedTypes: polyfill type augmentation
type MapPolyfill = Map<unknown, unknown> & { getOrInsertComputed?: Function };

if (typeof (Map.prototype as MapPolyfill).getOrInsertComputed !== "function") {
  (Map.prototype as MapPolyfill).getOrInsertComputed = function (
    key: unknown,
    cb: (k: unknown) => unknown,
  ) {
    if (this.has(key)) return this.get(key);
    const v = cb(key);
    this.set(key, v);
    return v;
  };
}
