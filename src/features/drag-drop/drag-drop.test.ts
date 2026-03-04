import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import type { TabId } from "../../shared/types";
import { TABS_CREATE, type TabsCommands } from "../tabs/tabs.shared";
import { register } from "./drag-drop.main";
import {
  DRAG_DROP_FILES_DROPPED,
  DRAG_DROP_OPEN_FILES,
  type DragDropCommands,
  type DragDropEvents,
  SUPPORTED_EXTENSIONS,
  isSupportedFile,
} from "./drag-drop.shared";

type AllCommands = DragDropCommands & TabsCommands;

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<DragDropEvents>();

  // Mock tabs:create handler
  let tabCounter = 0;
  commands.handle(TABS_CREATE, async () => {
    tabCounter += 1;
    return `tab-${tabCounter}` as TabId;
  });

  register({ commands, events });

  return { commands, events, getTabCount: () => tabCounter };
}

describe("isSupportedFile", () => {
  it("returns true for supported extensions", () => {
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(isSupportedFile(`/home/user/file.${ext}`)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isSupportedFile("/home/user/page.HTML")).toBe(true);
    expect(isSupportedFile("/home/user/image.PNG")).toBe(true);
  });

  it("returns false for unsupported extensions", () => {
    expect(isSupportedFile("/home/user/doc.docx")).toBe(false);
    expect(isSupportedFile("/home/user/app.exe")).toBe(false);
    expect(isSupportedFile("/home/user/archive.zip")).toBe(false);
  });

  it("returns false for files without extension", () => {
    expect(isSupportedFile("/home/user/Makefile")).toBe(false);
  });
});

describe("drag-drop:open-files", () => {
  it("opens supported files as tabs", async () => {
    const { commands, getTabCount } = setup();

    await commands.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/page.html", "/home/user/image.png"],
    });

    expect(getTabCount()).toBe(2);
  });

  it("activates only the first tab", async () => {
    const { commands } = setup();
    const createCalls: Array<{ url: string; activate?: boolean }> = [];

    // Re-register tabs:create to track activation
    const cmds = new CommandBus<AllCommands>();
    const evts = new EventBus<DragDropEvents>();
    cmds.handle(TABS_CREATE, async (payload) => {
      createCalls.push(payload);
      return "tab-1" as TabId;
    });
    register({ commands: cmds, events: evts });

    await cmds.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/a.html", "/home/user/b.html", "/home/user/c.html"],
    });

    expect(createCalls[0].activate).toBe(true);
    expect(createCalls[1].activate).toBe(false);
    expect(createCalls[2].activate).toBe(false);
  });

  it("creates file:// URLs from paths", async () => {
    const cmds = new CommandBus<AllCommands>();
    const evts = new EventBus<DragDropEvents>();
    const urls: string[] = [];
    cmds.handle(TABS_CREATE, async (payload) => {
      urls.push(payload.url);
      return "tab-1" as TabId;
    });
    register({ commands: cmds, events: evts });

    await cmds.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/page.html"],
    });

    expect(urls).toEqual(["file:///home/user/page.html"]);
  });

  it("filters out unsupported files", async () => {
    const { commands, getTabCount } = setup();

    await commands.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/page.html", "/home/user/doc.docx", "/home/user/image.png"],
    });

    expect(getTabCount()).toBe(2);
  });

  it("does nothing when all files are unsupported", async () => {
    const { commands, events, getTabCount } = setup();
    const dropped = vi.fn();
    events.on(DRAG_DROP_FILES_DROPPED, dropped);

    await commands.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/doc.docx", "/home/user/app.exe"],
    });

    expect(getTabCount()).toBe(0);
    expect(dropped).not.toHaveBeenCalled();
  });

  it("emits files-dropped event with supported paths", async () => {
    const { commands, events } = setup();
    const dropped = vi.fn();
    events.on(DRAG_DROP_FILES_DROPPED, dropped);

    await commands.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/page.html", "/home/user/doc.docx"],
    });

    expect(dropped).toHaveBeenCalledWith({
      filePaths: ["/home/user/page.html"],
    });
  });

  it("handles single file drop", async () => {
    const { commands, getTabCount } = setup();

    await commands.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/page.html"],
    });

    expect(getTabCount()).toBe(1);
  });

  it("continues opening files when one fails", async () => {
    const cmds = new CommandBus<AllCommands>();
    const evts = new EventBus<DragDropEvents>();
    const dropped = vi.fn();
    evts.on(DRAG_DROP_FILES_DROPPED, dropped);

    let callCount = 0;
    cmds.handle(TABS_CREATE, async () => {
      callCount++;
      if (callCount === 2) throw new Error("simulated failure");
      return `tab-${callCount}` as TabId;
    });
    register({ commands: cmds, events: evts });

    await cmds.send(DRAG_DROP_OPEN_FILES, {
      filePaths: ["/home/user/a.html", "/home/user/b.html", "/home/user/c.html"],
    });

    expect(callCount).toBe(3);
    expect(dropped).toHaveBeenCalledWith({
      filePaths: ["/home/user/a.html", "/home/user/c.html"],
    });
  });

  it("handles empty file list", async () => {
    const { commands, events, getTabCount } = setup();
    const dropped = vi.fn();
    events.on(DRAG_DROP_FILES_DROPPED, dropped);

    await commands.send(DRAG_DROP_OPEN_FILES, { filePaths: [] });

    expect(getTabCount()).toBe(0);
    expect(dropped).not.toHaveBeenCalled();
  });
});
