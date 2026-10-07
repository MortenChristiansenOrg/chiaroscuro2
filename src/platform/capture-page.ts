const CAPTURE_ERROR = "Could not capture the target page. Open it and try again.";
const captures = new WeakMap<Electron.WebContents, { count: number; throttled: boolean }>();

/** Temporarily paint hidden pages, preserving throttling across overlapping captures. */
export async function capturePageScreenshot(contents: Electron.WebContents): Promise<string> {
  if (contents.isDestroyed()) throw new Error("The target page closed.");
  let state = captures.get(contents);
  if (state) {
    state.count++;
  } else {
    state = { count: 1, throttled: contents.getBackgroundThrottling() };
    contents.setBackgroundThrottling(false);
    captures.set(contents, state);
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  try {
    const image = await Promise.race([
      (async () => {
        // A compositor copy can otherwise contain the previous CSS revision.
        await contents.executeJavaScript(
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
        );
        if (finished) throw new Error(CAPTURE_ERROR);
        return contents.capturePage();
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(CAPTURE_ERROR)), 10000);
      }),
    ]);
    if (image.isEmpty()) throw new Error(CAPTURE_ERROR);
    return image.toDataURL();
  } finally {
    finished = true;
    clearTimeout(timeout);
    if (--state.count === 0) {
      captures.delete(contents);
      if (!contents.isDestroyed()) contents.setBackgroundThrottling(state.throttled);
    }
  }
}
