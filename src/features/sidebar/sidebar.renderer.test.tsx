import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { makeTab } from "../../test-utils";
import type { SidebarDragContextType } from "./SidebarContext";
import { SidebarDragProvider, useSidebarDrag } from "./SidebarContext";
import { TabItem } from "./TabItem";

// ── Mocks ───────────────────────────────────────────────────────

const mockSendCommand = vi.fn(() => Promise.resolve());
Object.defineProperty(window, "chiaroscuro", {
  value: { ...window.chiaroscuro, sendCommand: mockSendCommand },
  writable: true,
  configurable: true,
});

type TabItemProps = Parameters<typeof TabItem>[0];

function defaultProps(overrides: Partial<TabItemProps> = {}): TabItemProps {
  return {
    tab: makeTab(),
    isActive: false,
    isEphemeral: false,
    isBookmarkedSection: true,
    ...overrides,
  };
}

// Helper to capture context refs for test assertions
let ctxRefs: SidebarDragContextType;
function RefCapture() {
  ctxRefs = useSidebarDrag();
  return null;
}

function renderWithDrag(
  props: TabItemProps,
  { isDragging = false }: { isDragging?: boolean } = {},
) {
  return render(
    <SidebarDragProvider isDragging={isDragging} onDragEnd={vi.fn()}>
      <RefCapture />
      <TabItem {...props} />
    </SidebarDragProvider>,
  );
}

/** Returns the outer tab div (the one with data-tab-id). */
function getTabEl() {
  return document.querySelector("[data-tab-id]") as HTMLElement;
}

/** Returns the tab title span. */
function getTitleSpan() {
  return screen.getByText("Example");
}

/** Returns the close button. */
function getCloseButton() {
  return screen.getByRole("button", { name: "Close tab" });
}

// ── Tests ───────────────────────────────────────────────────────

describe("TabItem", () => {
  beforeEach(() => {
    mockSendCommand.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Normal (no drag) state ──────────────────────────────────

  describe("normal state (no drag)", () => {
    it("has `group` class for hover propagation", () => {
      renderWithDrag(defaultProps());
      expect(getTabEl().classList.contains("group")).toBe(true);
    });

    it("has hover:bg-glass-hover class", () => {
      renderWithDrag(defaultProps());
      expect(getTabEl().className).toContain("hover:bg-glass-hover");
    });

    it("has hover:text-glass-text-hover class", () => {
      renderWithDrag(defaultProps());
      expect(getTabEl().className).toContain("hover:text-glass-text-hover");
    });

    it("has active: pseudo classes", () => {
      renderWithDrag(defaultProps());
      const cls = getTabEl().className;
      expect(cls).toContain("active:bg-glass-pressed");
      expect(cls).toContain("active:text-glass-text-pressed");
    });

    it("close button has group-hover:opacity-100", () => {
      renderWithDrag(defaultProps());
      expect(getCloseButton().className).toContain("group-hover:opacity-100");
    });

    it("title span has group-hover classes", () => {
      renderWithDrag(defaultProps());
      const cls = getTitleSpan().className;
      expect(cls).toContain("group-hover:text-glass-text-hover");
      expect(cls).toContain("group-hover:mr-5");
    });

    it("no drag background style on normal tab", () => {
      renderWithDrag(defaultProps());
      expect(getTabEl().style.background).toBe("");
    });
  });

  // ── Active tab state ────────────────────────────────────────

  describe("active tab", () => {
    it("applies glass-active background", () => {
      renderWithDrag(defaultProps({ isActive: true }));
      expect(getTabEl().style.background).toBe("var(--glass-active)");
    });

    it("applies shadow-subtle boxShadow", () => {
      renderWithDrag(defaultProps({ isActive: true }));
      expect(getTabEl().style.boxShadow).toBe("var(--shadow-subtle)");
    });

    it("title has text-glass-text-primary class", () => {
      renderWithDrag(defaultProps({ isActive: true }));
      expect(getTitleSpan().className).toContain("text-glass-text-primary");
    });
  });

  // ── During drag: isDragging=true (any tab being dragged) ───

  describe("during drag (isDragging=true)", () => {
    it("removes `group` class to disable group-hover on children", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      expect(getTabEl().classList.contains("group")).toBe(false);
    });

    it("removes hover:bg-glass-hover class", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      expect(getTabEl().className).not.toContain("hover:bg-glass-hover");
    });

    it("removes hover:text-glass-text-hover class", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      expect(getTabEl().className).not.toContain("hover:text-glass-text-hover");
    });

    it("removes active: pseudo classes during drag", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      const cls = getTabEl().className;
      expect(cls).not.toContain("active:bg-glass-pressed");
      expect(cls).not.toContain("active:text-glass-text-pressed");
    });

    it("non-dragged tab has no drag background", () => {
      renderWithDrag(defaultProps({ isDragged: false }), { isDragging: true });
      expect(getTabEl().style.background).toBe("");
    });

    it("non-dragged tab has no zIndex", () => {
      renderWithDrag(defaultProps({ isDragged: false }), { isDragging: true });
      expect(getTabEl().style.zIndex).toBe("");
    });
  });

  // ── Dragged tab styling ─────────────────────────────────────

  describe("dragged tab (isDragged=true)", () => {
    it("applies accent background", () => {
      renderWithDrag(defaultProps({ isDragged: true }), { isDragging: true });
      expect(getTabEl().style.background).toContain("oklch");
      expect(getTabEl().style.background).toContain("0.06");
    });

    it("applies accent inset boxShadow", () => {
      renderWithDrag(defaultProps({ isDragged: true }), { isDragging: true });
      expect(getTabEl().style.boxShadow).toContain("inset");
      expect(getTabEl().style.boxShadow).toContain("0.25");
    });

    it("has elevated zIndex", () => {
      renderWithDrag(defaultProps({ isDragged: true }), { isDragging: true });
      expect(getTabEl().style.zIndex).toBe("10");
    });

    it("does NOT have group class", () => {
      renderWithDrag(defaultProps({ isDragged: true }), { isDragging: true });
      expect(getTabEl().classList.contains("group")).toBe(false);
    });
  });

  // ── Dragged tab that is also active ─────────────────────────

  describe("active tab being dragged", () => {
    it("drag style takes precedence over active style for background", () => {
      renderWithDrag(defaultProps({ isActive: true, isDragged: true }), { isDragging: true });
      const bg = getTabEl().style.background;
      expect(bg).toContain("oklch");
      expect(bg).not.toBe("var(--glass-active)");
    });

    it("drag boxShadow takes precedence over active shadow", () => {
      renderWithDrag(defaultProps({ isActive: true, isDragged: true }), { isDragging: true });
      const shadow = getTabEl().style.boxShadow;
      expect(shadow).toContain("inset");
      expect(shadow).not.toBe("var(--shadow-subtle)");
    });
  });

  // ── DragStart handler ──────────────────────────────────────

  describe("handleDragStart", () => {
    it("sets dragTabIdRef to tab id", () => {
      renderWithDrag(defaultProps());
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(getTabEl(), { dataTransfer });
      expect(ctxRefs.dragTabIdRef.current).toBe("tab-1");
    });

    it("sets effectAllowed to move", () => {
      renderWithDrag(defaultProps());
      let captured: DataTransfer | undefined;
      getTabEl().addEventListener(
        "dragstart",
        (e) => {
          captured = e.dataTransfer ?? undefined;
        },
        { once: true },
      );
      fireEvent.dragStart(getTabEl(), { dataTransfer: new DataTransfer() });
      expect(captured?.effectAllowed).toBe("move");
    });

    it("sets text/plain data to tab id", () => {
      renderWithDrag(defaultProps());
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(getTabEl(), { dataTransfer });
      expect(dataTransfer.getData("text/plain")).toBe("tab-1");
    });

    it("resets lastSwapRef and lastSwapTimeRef", () => {
      renderWithDrag(defaultProps());
      // Set some existing values
      ctxRefs.lastSwapRef.current = { targetId: "tab-2" as TabId, position: "after" };
      ctxRefs.lastSwapTimeRef.current = 12345;

      fireEvent.dragStart(getTabEl(), { dataTransfer: new DataTransfer() });
      expect(ctxRefs.lastSwapRef.current).toBeNull();
      expect(ctxRefs.lastSwapTimeRef.current).toBe(0);
    });
  });

  // ── DragOver handler ───────────────────────────────────────

  describe("handleDragOver", () => {
    it("sends TABS_REORDER when different tab is dragged over", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      // Set drag source to a different tab
      ctxRefs.dragTabIdRef.current = "tab-2" as TabId;
      ctxRefs.onBeforeReorderRef.current = vi.fn();

      const tabEl = getTabEl();
      vi.spyOn(tabEl, "getBoundingClientRect").mockReturnValue({
        top: 100,
        height: 40,
        bottom: 140,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => {},
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.dropEffect = "move";
      fireEvent.dragOver(tabEl, { dataTransfer, clientY: 130 });

      expect(ctxRefs.onBeforeReorderRef.current).toHaveBeenCalled();
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:reorder", {
        tabId: "tab-2",
        targetBookmarked: true,
        targetTabId: "tab-1",
        position: expect.stringMatching(/^(before|after)$/),
        targetFolderId: null,
      });
    });

    it("does not reorder when dragged tab is same as target", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      ctxRefs.dragTabIdRef.current = "tab-1" as TabId;

      fireEvent.dragOver(getTabEl(), {
        dataTransfer: new DataTransfer(),
        clientY: 130,
      });

      expect(mockSendCommand).not.toHaveBeenCalled();
    });

    it("throttles reorder calls within 100ms", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      ctxRefs.dragTabIdRef.current = "tab-2" as TabId;
      ctxRefs.lastSwapTimeRef.current = Date.now(); // recent swap

      fireEvent.dragOver(getTabEl(), {
        dataTransfer: new DataTransfer(),
        clientY: 130,
      });

      expect(mockSendCommand).not.toHaveBeenCalled();
    });

    it("detects before position when cursor in top half", () => {
      renderWithDrag(defaultProps(), { isDragging: true });
      ctxRefs.dragTabIdRef.current = "tab-2" as TabId;
      ctxRefs.onBeforeReorderRef.current = vi.fn();

      const tabEl = getTabEl();
      vi.spyOn(tabEl, "getBoundingClientRect").mockReturnValue({
        top: 100,
        height: 40,
        bottom: 140,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => {},
      });

      fireEvent.dragOver(tabEl, {
        dataTransfer: new DataTransfer(),
        clientY: 110,
      });

      expect(mockSendCommand).toHaveBeenCalledWith(
        "tabs:reorder",
        expect.objectContaining({ position: "before" }),
      );
    });
  });

  // ── Drop handler ───────────────────────────────────────────

  describe("handleDrop", () => {
    it("calls preventDefault", () => {
      renderWithDrag(defaultProps());
      const prevented = fireEvent.drop(getTabEl());
      expect(prevented).toBe(false);
    });
  });

  // ── Exiting tab state ──────────────────────────────────────

  describe("exiting tab", () => {
    it("sets pointer-events to none", () => {
      renderWithDrag(defaultProps({ exiting: true }));
      expect(getTabEl().style.pointerEvents).toBe("none");
    });

    it("has tab-out animation", () => {
      renderWithDrag(defaultProps({ exiting: true }));
      expect(getTabEl().style.animation).toContain("tab-out");
    });

    it("is not draggable", () => {
      renderWithDrag(defaultProps({ exiting: true }));
      expect(getTabEl().getAttribute("draggable")).toBe("false");
    });
  });

  // ── Ephemeral tab styling ──────────────────────────────────

  describe("ephemeral tab", () => {
    it("title has text-glass-text-muted class", () => {
      renderWithDrag(defaultProps({ isEphemeral: true }));
      expect(getTitleSpan().className).toContain("text-glass-text-muted");
    });
  });

  // ── Click handler ──────────────────────────────────────────

  describe("click", () => {
    it("sends tabs:activate command", () => {
      renderWithDrag(defaultProps());
      fireEvent.click(getTabEl());
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:activate", { tabId: "tab-1" });
    });
  });

  // ── Close button ───────────────────────────────────────────

  describe("close button", () => {
    it("sends tabs:close command and stops propagation", () => {
      renderWithDrag(defaultProps());
      fireEvent.click(getCloseButton());
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:close", { tabId: "tab-1" });
      expect(mockSendCommand).not.toHaveBeenCalledWith("tabs:activate", expect.anything());
    });
  });

  // ── Style transitions between states ───────────────────────

  describe("state transitions", () => {
    it("transitions from normal → dragging removes group and hover classes", () => {
      const { rerender } = render(
        <SidebarDragProvider isDragging={false} onDragEnd={vi.fn()}>
          <TabItem {...defaultProps()} />
        </SidebarDragProvider>,
      );
      expect(getTabEl().classList.contains("group")).toBe(true);
      expect(getTabEl().className).toContain("hover:bg-glass-hover");

      rerender(
        <SidebarDragProvider isDragging={true} onDragEnd={vi.fn()}>
          <TabItem {...defaultProps()} />
        </SidebarDragProvider>,
      );
      expect(getTabEl().classList.contains("group")).toBe(false);
      expect(getTabEl().className).not.toContain("hover:bg-glass-hover");
    });

    it("transitions from dragging → normal restores group and hover classes", () => {
      const { rerender } = render(
        <SidebarDragProvider isDragging={true} onDragEnd={vi.fn()}>
          <TabItem {...defaultProps()} />
        </SidebarDragProvider>,
      );
      expect(getTabEl().classList.contains("group")).toBe(false);

      rerender(
        <SidebarDragProvider isDragging={false} onDragEnd={vi.fn()}>
          <TabItem {...defaultProps()} />
        </SidebarDragProvider>,
      );
      expect(getTabEl().classList.contains("group")).toBe(true);
      expect(getTabEl().className).toContain("hover:bg-glass-hover");
    });

    it("transitions from isDragged → not isDragged removes drag styling", () => {
      const { rerender } = render(
        <SidebarDragProvider isDragging={true} onDragEnd={vi.fn()}>
          <TabItem {...defaultProps({ isDragged: true })} />
        </SidebarDragProvider>,
      );
      expect(getTabEl().style.background).toContain("oklch");
      expect(getTabEl().style.zIndex).toBe("10");

      rerender(
        <SidebarDragProvider isDragging={false} onDragEnd={vi.fn()}>
          <TabItem {...defaultProps({ isDragged: false })} />
        </SidebarDragProvider>,
      );
      expect(getTabEl().style.background).toBe("");
      expect(getTabEl().style.zIndex).toBe("");
    });

    it("non-active, non-dragged tab during drag has no special background", () => {
      renderWithDrag(defaultProps({ isActive: false, isDragged: false }), { isDragging: true });
      expect(getTabEl().style.background).toBe("");
      expect(getTabEl().style.boxShadow).toBe("");
    });
  });
});
