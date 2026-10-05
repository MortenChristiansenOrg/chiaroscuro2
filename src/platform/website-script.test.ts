import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { runWebsiteScript, websiteScriptCode } from "./website-script";

function pageContents() {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isLoadingMainFrame: (): boolean => false,
    getURL: () => "https://example.com/",
    mainFrame: { isDestroyed: () => false, executeJavaScript: vi.fn(async () => ({})) },
  });
  return { contents, native: contents as unknown as WebContents };
}

describe("website script execution", () => {
  it("supports awaited page scripts and a lexical clipboard helper", async () => {
    const document = { title: "An issue title" };
    const result = await runInNewContext(
      websiteScriptCode(
        "await Promise.resolve(); await copy(document.title); document.title = 'Done';",
        "https://example.com/issues/1",
      ),
      { location: { href: "https://example.com/issues/1" }, document },
    );
    expect(result).toEqual({ clipboard: "An issue title" });
    expect(document.title).toBe("Done");
  });

  it("does not execute source on a page that no longer matches", async () => {
    const document = { title: "Other domain" };
    await expect(
      runInNewContext(websiteScriptCode("document.title = 'Wrong';", "https://example.com/"), {
        location: { href: "https://unrelated.test/" },
        document,
      }),
    ).rejects.toThrow("page changed");
    expect(document.title).toBe("Other domain");
  });

  it("discards clipboard output when the script throws", async () => {
    await expect(
      runInNewContext(
        websiteScriptCode(
          "copy('partial'); throw new Error('Could not find issue');",
          "https://example.com/",
        ),
        { location: { href: "https://example.com/" } },
      ),
    ).rejects.toThrow("Could not find issue");
  });

  it("handles return statements without publishing an arbitrary result", async () => {
    const result = await runInNewContext(
      websiteScriptCode("return { clipboard: 'spoofed' };", "https://example.com/"),
      { location: { href: "https://example.com/" } },
    );
    expect(result).toEqual({});
  });

  it("cancels pending clipboard output even when navigation goes to the same URL", async () => {
    const { contents, native } = pageContents();
    let finish: (value: { clipboard: string }) => void = () => {};
    contents.mainFrame.executeJavaScript.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = runWebsiteScript(native, {
      source: "await copy('old page');",
      expectedUrl: "https://example.com/",
      userGesture: true,
    });
    contents.emit("did-start-navigation", { isMainFrame: true });
    finish({ clipboard: "old page" });
    await expect(running).rejects.toThrow("page changed");
    expect(contents.listenerCount("did-start-navigation")).toBe(0);
    expect(contents.listenerCount("destroyed")).toBe(0);
  });

  it("does not cancel for an iframe navigation", async () => {
    const { contents, native } = pageContents();
    contents.mainFrame.executeJavaScript.mockImplementation(async () => {
      contents.emit("did-start-navigation", { isMainFrame: false });
      return { clipboard: "main page" };
    });
    await expect(
      runWebsiteScript(native, {
        source: "copy('main page');",
        expectedUrl: "https://example.com/",
        userGesture: false,
      }),
    ).resolves.toEqual({ clipboard: "main page" });
  });

  it("rejects a closed or loading page before evaluating any source", async () => {
    const { contents, native } = pageContents();
    contents.isLoadingMainFrame = () => true;
    await expect(
      runWebsiteScript(native, {
        source: "copy('loading');",
        expectedUrl: "https://example.com/",
        userGesture: false,
      }),
    ).rejects.toThrow("still loading");
    expect(contents.mainFrame.executeJavaScript).not.toHaveBeenCalled();
  });

  it("reports scripts that never settle without retaining navigation listeners", async () => {
    vi.useFakeTimers();
    try {
      const { contents, native } = pageContents();
      contents.mainFrame.executeJavaScript.mockImplementation(() => new Promise(() => {}));
      const running = runWebsiteScript(native, {
        source: "await new Promise(() => {});",
        expectedUrl: "https://example.com/",
        userGesture: false,
      });
      const check = expect(running).rejects.toThrow("10 seconds");
      await vi.advanceTimersByTimeAsync(10_000);
      await check;
      expect(contents.listenerCount("did-start-navigation")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
