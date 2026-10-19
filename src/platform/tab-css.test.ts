import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAB_CSS_DONE, TAB_CSS_INSERT, TAB_CSS_REMOVE } from "../shared/tab-css";

const { ipcMain } = vi.hoisted(() => {
  const { EventEmitter } = require("node:events") as typeof import("node:events");
  return { ipcMain: new EventEmitter() };
});
vi.mock("electron", () => ({ ipcMain }));

import { insertTabCss, removeTabCss } from "./tab-css";

type Sent = [channel: string, key: string, ...args: unknown[]];

function fixture() {
  const sent: Sent[] = [];
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    send: vi.fn((...message: Sent) => sent.push(message)),
  });
  /** Answer as the tab preload does. */
  const answer = (message: Sent, error?: string) => {
    const operation = message[0] === TAB_CSS_INSERT ? "insert" : "remove";
    ipcMain.emit(TAB_CSS_DONE, { sender: contents }, message[1], operation, error);
  };
  const at = (index: number): Sent => {
    const message = sent[index];
    if (!message) throw new Error(`No message ${index} was sent`);
    return message;
  };
  return { contents, sent, at, answer, webContents: contents as unknown as Electron.WebContents };
}

describe("tab CSS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts and removes CSS through the preload and keeps no listeners", async () => {
    const { contents, sent, at, answer, webContents } = fixture();
    const inserted = insertTabCss(webContents, "h1{color:red}");
    expect(sent).toEqual([[TAB_CSS_INSERT, expect.any(String), "h1{color:red}"]]);
    answer(at(0));
    const key = await inserted;
    expect(key).toBe(at(0)[1]);

    const removed = removeTabCss(webContents, key);
    expect(at(1)).toEqual([TAB_CSS_REMOVE, key]);
    answer(at(1));
    await expect(removed).resolves.toBeUndefined();
    expect(contents.eventNames()).toEqual([]);
  });

  it("gives every insert a distinct key", async () => {
    const { at, answer, webContents } = fixture();
    const first = insertTabCss(webContents, "a{}");
    const second = insertTabCss(webContents, "b{}");
    answer(at(1));
    answer(at(0));
    expect(new Set(await Promise.all([first, second])).size).toBe(2);
  });

  it.each(["did-navigate", "render-process-gone", "destroyed"])(
    "abandons an unanswered call on %s without keeping any listener",
    async (event) => {
      const { contents, webContents } = fixture();
      const result = insertTabCss(webContents, "h1{}");
      contents.emit(event);
      await expect(result).rejects.toThrow("The page changed before its CSS was updated");
      expect(contents.eventNames()).toEqual([]);
    },
  );

  it("keeps one IPC listener however many calls are lost (#127)", async () => {
    const { contents, webContents } = fixture();
    const lost = Array.from({ length: 5 }, () => insertTabCss(webContents, "h1{}"));
    contents.emit("did-navigate");
    await Promise.allSettled(lost);
    expect(ipcMain.listenerCount(TAB_CSS_DONE)).toBe(1);
    expect(contents.eventNames()).toEqual([]);
  });

  it("abandons on a main-frame error page but not on a failed subframe", async () => {
    const { contents, webContents } = fixture();
    const result = insertTabCss(webContents, "h1{}");
    const settled = vi.fn();
    result.catch(settled);
    contents.emit("did-fail-load", {}, -105, "Failed", "https://example.com/frame", false);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    contents.emit("did-fail-load", {}, -105, "Failed", "https://example.com", true);
    await expect(result).rejects.toThrow("The page changed before its CSS was updated");
  });

  it("removes a style whose insert is answered after its document was replaced", async () => {
    const { contents, sent, at, answer, webContents } = fixture();
    const result = insertTabCss(webContents, "h1{}");
    contents.emit("did-navigate");
    await expect(result).rejects.toThrow();
    answer(at(0));
    expect(at(1)).toEqual([TAB_CSS_REMOVE, at(0)[1]]);
    // The stray removal's own answer needs nothing further.
    answer(at(1));
    expect(sent).toHaveLength(2);
  });

  it("ignores answers from other pages", async () => {
    const page = fixture();
    const other = fixture();
    const result = insertTabCss(page.webContents, "h1{}");
    const settled = vi.fn();
    result.then(settled, settled);
    ipcMain.emit(TAB_CSS_DONE, { sender: other.contents }, page.at(0)[1], "insert");
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    page.answer(page.at(0));
    await expect(result).resolves.toBe(page.at(0)[1]);
  });

  it("passes renderer failures through", async () => {
    const { at, answer, webContents } = fixture();
    const result = insertTabCss(webContents, "h1{}");
    answer(at(0), "Error: invalid");
    await expect(result).rejects.toThrow("Error: invalid");
  });

  it("does not call into destroyed contents", async () => {
    const { contents, webContents } = fixture();
    contents.isDestroyed.mockReturnValue(true);
    await expect(insertTabCss(webContents, "h1{}")).rejects.toThrow("The page was closed");
    expect(contents.send).not.toHaveBeenCalled();
  });
});
