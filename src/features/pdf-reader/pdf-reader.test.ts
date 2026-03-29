import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId, WorkspaceId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils/mock-platform";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import feature from "./pdf-reader.main";
import {
  type IndexEntry,
  PDF_READER_FETCH,
  PDF_READER_GET_INDEX,
  PDF_READER_INDEX_ADD,
  PDF_READER_INDEX_CHANGED,
  PDF_READER_INDEX_DELETE,
  PDF_READER_INDEX_REORDER,
  PDF_READER_INDEX_UPDATE,
  type PdfIndexChangedEvent,
  type PdfReaderCommands,
  type PdfReaderEvents,
} from "./pdf-reader.shared";

type AllCommands = PdfReaderCommands & Pick<TabsCommands, "tabs:create" | "tabs:close">;
type AllEvents = PdfReaderEvents &
  Pick<TabsEvents, "tabs:created" | "tabs:updated" | "tabs:closed">;

function setup() {
  const commands = new CommandBus<AllCommands>();
  const events = new EventBus<AllEvents>();
  const dataStore = new MemoryDataStore();
  const platform = createMockPlatform();
  let activeTabId: TabId | undefined;

  const deps = {
    commands,
    events,
    platform,
    dataStore,
    getActiveTabId: () => activeTabId,
    getActiveWorkspaceId: () => "ws-1" as WorkspaceId,
  };

  // Mock tab commands
  const createSpy = vi.fn(async () => "mock-tab" as TabId);
  const closeSpy = vi.fn(async () => {});
  commands.handle("tabs:create", createSpy);
  commands.handle("tabs:close", closeSpy);

  feature.register(deps);
  return { commands, events, dataStore, deps, createSpy, closeSpy };
}

describe("pdf-reader commands", () => {
  describe("PDF_READER_GET_INDEX", () => {
    it("returns empty array for unknown PDF", async () => {
      const { commands } = setup();
      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey: "unknown:abc" });
      expect(entries).toEqual([]);
    });
  });

  describe("PDF_READER_INDEX_ADD", () => {
    it("adds an entry and emits INDEX_CHANGED", async () => {
      const { commands, events } = setup();
      const listener = vi.fn();
      events.on(PDF_READER_INDEX_CHANGED, listener);

      await commands.send(PDF_READER_INDEX_ADD, {
        pdfKey: "test.pdf:abc123",
        label: "Chapter 1",
        page: 5,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          pdfKey: "test.pdf:abc123",
          entries: [
            expect.objectContaining({
              label: "Chapter 1",
              page: 5,
              order: 0,
            }),
          ],
        }),
      );

      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey: "test.pdf:abc123" });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ label: "Chapter 1", page: 5 });
    });

    it("appends entries with incrementing order", async () => {
      const { commands } = setup();
      const pdfKey = "test.pdf:abc";

      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "First", page: 1 });
      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "Second", page: 10 });
      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "Third", page: 20 });

      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.order)).toEqual([0, 1, 2]);
      expect(entries.map((e) => e.label)).toEqual(["First", "Second", "Third"]);
    });
  });

  describe("PDF_READER_INDEX_UPDATE", () => {
    it("updates entry label", async () => {
      const { commands } = setup();
      const pdfKey = "test.pdf:xyz";

      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "Old", page: 1 });
      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      const entryId = entries[0]?.id;
      if (!entryId) throw new Error("Expected entry");

      await commands.send(PDF_READER_INDEX_UPDATE, { pdfKey, entryId, label: "New" });

      const updated = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      expect(updated[0]).toMatchObject({ label: "New", page: 1 });
    });

    it("updates entry page", async () => {
      const { commands } = setup();
      const pdfKey = "test.pdf:xyz";

      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "Test", page: 1 });
      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      const entryId = entries[0]?.id;
      if (!entryId) throw new Error("Expected entry");

      await commands.send(PDF_READER_INDEX_UPDATE, { pdfKey, entryId, page: 42 });

      const updated = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      expect(updated[0]).toMatchObject({ label: "Test", page: 42 });
    });
  });

  describe("PDF_READER_INDEX_DELETE", () => {
    it("removes entry and re-orders remaining", async () => {
      const { commands } = setup();
      const pdfKey = "test.pdf:del";

      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "A", page: 1 });
      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "B", page: 2 });
      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "C", page: 3 });

      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      const idB = entries[1]?.id;
      if (!idB) throw new Error("Expected entry B");

      await commands.send(PDF_READER_INDEX_DELETE, { pdfKey, entryId: idB });

      const remaining = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      expect(remaining).toHaveLength(2);
      expect(remaining.map((e) => e.label)).toEqual(["A", "C"]);
      expect(remaining.map((e) => e.order)).toEqual([0, 1]);
    });
  });

  describe("PDF_READER_INDEX_REORDER", () => {
    it("reorders entries by given ID sequence", async () => {
      const { commands } = setup();
      const pdfKey = "test.pdf:reord";

      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "A", page: 1 });
      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "B", page: 2 });
      await commands.send(PDF_READER_INDEX_ADD, { pdfKey, label: "C", page: 3 });

      const entries = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      const ids = entries.map((e) => e.id);

      // Reverse order: C, B, A
      await commands.send(PDF_READER_INDEX_REORDER, {
        pdfKey,
        entryIds: [ids[2], ids[1], ids[0]].filter(Boolean) as string[],
      });

      const reordered = await commands.send(PDF_READER_GET_INDEX, { pdfKey });
      expect(reordered.map((e) => e.label)).toEqual(["C", "B", "A"]);
      expect(reordered.map((e) => e.order)).toEqual([0, 1, 2]);
    });
  });

  describe("PDF URL interception", () => {
    it("intercepts non-built-in tabs with .pdf URLs", async () => {
      const { events, createSpy, closeSpy } = setup();

      events.emit("tabs:created", {
        tab: {
          id: "tab-1" as TabId,
          workspaceId: "ws-1" as WorkspaceId,
          url: "https://example.com/doc.pdf",
          title: "doc.pdf",
          favicon: "",
          loading: true,
          bookmarked: false,
          lastAccessedAt: Date.now(),
          createdAt: Date.now(),
          order: 0,
          folderId: null,
        },
      });

      // Allow promises to resolve
      await new Promise((r) => setTimeout(r, 10));

      expect(closeSpy).toHaveBeenCalledWith({ tabId: "tab-1" });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("app:pdf-reader?url="),
        }),
      );
    });

    it("does not intercept built-in tabs", async () => {
      const { events, closeSpy } = setup();

      events.emit("tabs:created", {
        tab: {
          id: "tab-2" as TabId,
          workspaceId: "ws-1" as WorkspaceId,
          url: "app:pdf-reader?url=test.pdf",
          title: "PDF",
          favicon: "",
          loading: false,
          bookmarked: false,
          builtIn: true,
          lastAccessedAt: Date.now(),
          createdAt: Date.now(),
          order: 0,
          folderId: null,
        },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it("does not intercept non-PDF URLs", async () => {
      const { events, closeSpy } = setup();

      events.emit("tabs:created", {
        tab: {
          id: "tab-3" as TabId,
          workspaceId: "ws-1" as WorkspaceId,
          url: "https://example.com/page.html",
          title: "Page",
          favicon: "",
          loading: true,
          bookmarked: false,
          lastAccessedAt: Date.now(),
          createdAt: Date.now(),
          order: 0,
          folderId: null,
        },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });
});
