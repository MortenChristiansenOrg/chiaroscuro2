import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePageScreenshot } from "./capture-page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(throttled = true) {
  const image = {
    isEmpty: () => false,
    toDataURL: () => "data:image/png;base64,painted",
  } as Electron.NativeImage;
  const native = {
    isDestroyed: vi.fn(() => false),
    getBackgroundThrottling: vi.fn(() => throttled),
    setBackgroundThrottling: vi.fn((value: boolean) => {
      throttled = value;
    }),
    executeJavaScript: vi.fn(async () => true),
    capturePage: vi.fn(async () => image),
  };
  return { image, native, contents: native as unknown as Electron.WebContents };
}

afterEach(() => vi.useRealTimers());

describe("hidden page screenshot capture", () => {
  it.each([
    [0, 1],
    [1, 0],
  ] as const)(
    "restores throttling after overlapping captures finish in order %j",
    async (first, last) => {
      const { contents, native, image } = fixture();
      const pending = [deferred<Electron.NativeImage>(), deferred<Electron.NativeImage>()] as const;
      native.capturePage
        .mockImplementationOnce(() => pending[0].promise)
        .mockImplementationOnce(() => pending[1].promise);
      const results = [capturePageScreenshot(contents), capturePageScreenshot(contents)];
      await vi.waitFor(() => expect(native.capturePage).toHaveBeenCalledTimes(2));
      pending[first].resolve(image);
      await results[first];
      expect(native.getBackgroundThrottling()).toBe(false);
      pending[last].resolve(image);
      await results[last];
      expect(native.getBackgroundThrottling()).toBe(true);
    },
  );

  it("preserves a previously disabled throttling setting", async () => {
    const { contents, native } = fixture(false);
    await expect(capturePageScreenshot(contents)).resolves.toContain("painted");
    expect(native.getBackgroundThrottling()).toBe(false);
  });

  it("restores throttling after a capture failure", async () => {
    const { contents, native } = fixture();
    native.capturePage.mockRejectedValueOnce(new Error("capture failed"));
    await expect(capturePageScreenshot(contents)).rejects.toThrow("capture failed");
    expect(native.getBackgroundThrottling()).toBe(true);
  });

  it("times out a stalled render and never captures after its frames arrive late", async () => {
    vi.useFakeTimers();
    const { contents, native } = fixture();
    const frames = deferred<boolean>();
    native.executeJavaScript.mockImplementationOnce(() => frames.promise);
    const result = capturePageScreenshot(contents);
    const rejected = expect(result).rejects.toThrow("Could not capture");
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(native.getBackgroundThrottling()).toBe(true);
    frames.resolve(true);
    await Promise.resolve();
    expect(native.capturePage).not.toHaveBeenCalled();
    await expect(capturePageScreenshot(contents)).resolves.toContain("painted");
    expect(native.getBackgroundThrottling()).toBe(true);
  });
});
