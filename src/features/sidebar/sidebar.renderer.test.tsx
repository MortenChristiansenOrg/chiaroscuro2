import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { makeTab } from "../../test-utils";
import { TabItem } from "./sidebar.renderer";

// ── Mocks ───────────────────────────────────────────────────────

const mockSendCommand = vi.fn(() => Promise.resolve());
Object.defineProperty(window, "chiaroscuro", {
  value: { ...window.chiaroscuro, sendCommand: mockSendCommand },
  writable: true,
  configurable: true,
});

function makeRef<T>(val: T) {
  return { current: val };
}

type TabItemProps = Parameters<typeof TabItem>[0];

function defaultProps(overrides: Partial<TabItemProps> = {}): TabItemProps {
  return {
    tab: makeTab(),
    isActive: false,
    isEphemeral: false,
    isBookmarkedSection: true,
    dragTabIdRef: makeRef<TabId | null>(null),
    isDragged: false,
    isDragging: false,
    onBeforeReorder: vi.fn(),
    lastSwapRef: makeRef(null),
    lastSwapTimeRef: makeRef(0),
    ...overrides,
  };
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
      render(<TabItem {...defaultProps()} />);
      expect(getTabEl().classList.contains("group")).toBe(true);
    });

    it("has hover:bg-glass-hover class", () => {
      render(<TabItem {...defaultProps()} />);
      expect(getTabEl().className).toContain("hover:bg-glass-hover");
    });

    it("has hover:text-glass-text-hover class", () => {
      render(<TabItem {...defaultProps()} />);
      expect(getTabEl().className).toContain("hover:text-glass-text-hover");
    });

    it("has active: pseudo classes", () => {
      render(<TabItem {...defaultProps()} />);
      const cls = getTabEl().className;
      expect(cls).toContain("active:bg-glass-pressed");
      expect(cls).toContain("active:text-glass-text-pressed");
    });

    it("close button has group-hover:opacity-100", () => {
      render(<TabItem {...defaultProps()} />);
      expect(getCloseButton().className).toContain("group-hover:opacity-100");
    });

    it("title span has group-hover classes", () => {
      render(<TabItem {...defaultProps()} />);
      const cls = getTitleSpan().className;
      expect(cls).toContain("group-hover:text-glass-text-hover");
      expect(cls).toContain("group-hover:mr-5");
    });

    it("no drag background style on normal tab", () => {
      render(<TabItem {...defaultProps()} />);
      expect(getTabEl().style.background).toBe("");
    });
  });

  // ── Active tab state ────────────────────────────────────────

  describe("active tab", () => {
    it("applies glass-active background", () => {
      render(<TabItem {...defaultProps({ isActive: true })} />);
      expect(getTabEl().style.background).toBe("var(--glass-active)");
    });

    it("applies shadow-subtle boxShadow", () => {
      render(<TabItem {...defaultProps({ isActive: true })} />);
      expect(getTabEl().style.boxShadow).toBe("var(--shadow-subtle)");
    });

    it("title has text-glass-text-primary class", () => {
      render(<TabItem {...defaultProps({ isActive: true })} />);
      expect(getTitleSpan().className).toContain("text-glass-text-primary");
    });
  });

  // ── During drag: isDragging=true (any tab being dragged) ───

  describe("during drag (isDragging=true)", () => {
    it("removes `group` class to disable group-hover on children", () => {
      render(<TabItem {...defaultProps({ isDragging: true })} />);
      expect(getTabEl().classList.contains("group")).toBe(false);
    });

    it("removes hover:bg-glass-hover class", () => {
      render(<TabItem {...defaultProps({ isDragging: true })} />);
      expect(getTabEl().className).not.toContain("hover:bg-glass-hover");
    });

    it("removes hover:text-glass-text-hover class", () => {
      render(<TabItem {...defaultProps({ isDragging: true })} />);
      expect(getTabEl().className).not.toContain("hover:text-glass-text-hover");
    });

    it("removes active: pseudo classes during drag", () => {
      render(<TabItem {...defaultProps({ isDragging: true })} />);
      const cls = getTabEl().className;
      expect(cls).not.toContain("active:bg-glass-pressed");
      expect(cls).not.toContain("active:text-glass-text-pressed");
    });

    it("non-dragged tab has no drag background", () => {
      render(<TabItem {...defaultProps({ isDragging: true, isDragged: false })} />);
      expect(getTabEl().style.background).toBe("");
    });

    it("non-dragged tab has no zIndex", () => {
      render(<TabItem {...defaultProps({ isDragging: true, isDragged: false })} />);
      expect(getTabEl().style.zIndex).toBe("");
    });
  });

  // ── Dragged tab styling ─────────────────────────────────────

  describe("dragged tab (isDragged=true)", () => {
    it("applies accent background", () => {
      render(<TabItem {...defaultProps({ isDragging: true, isDragged: true })} />);
      expect(getTabEl().style.background).toContain("oklch");
      expect(getTabEl().style.background).toContain("0.06");
    });

    it("applies accent inset boxShadow", () => {
      render(<TabItem {...defaultProps({ isDragging: true, isDragged: true })} />);
      expect(getTabEl().style.boxShadow).toContain("inset");
      expect(getTabEl().style.boxShadow).toContain("0.25");
    });

    it("has elevated zIndex", () => {
      render(<TabItem {...defaultProps({ isDragging: true, isDragged: true })} />);
      expect(getTabEl().style.zIndex).toBe("10");
    });

    it("does NOT have group class", () => {
      render(<TabItem {...defaultProps({ isDragging: true, isDragged: true })} />);
      expect(getTabEl().classList.contains("group")).toBe(false);
    });
  });

  // ── Dragged tab that is also active ─────────────────────────

  describe("active tab being dragged", () => {
    it("drag style takes precedence over active style for background", () => {
      render(<TabItem {...defaultProps({ isActive: true, isDragging: true, isDragged: true })} />);
      const bg = getTabEl().style.background;
      // Should be the drag accent color, not var(--glass-active)
      expect(bg).toContain("oklch");
      expect(bg).not.toBe("var(--glass-active)");
    });

    it("drag boxShadow takes precedence over active shadow", () => {
      render(<TabItem {...defaultProps({ isActive: true, isDragging: true, isDragged: true })} />);
      const shadow = getTabEl().style.boxShadow;
      expect(shadow).toContain("inset");
      expect(shadow).not.toBe("var(--shadow-subtle)");
    });
  });

  // ── DragStart handler ──────────────────────────────────────

  describe("handleDragStart", () => {
    it("sets dragTabIdRef to tab id", () => {
      const dragTabIdRef = makeRef<TabId | null>(null);
      render(<TabItem {...defaultProps({ dragTabIdRef })} />);
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(getTabEl(), { dataTransfer });
      expect(dragTabIdRef.current).toBe("tab-1");
    });

    it("sets effectAllowed to move", () => {
      const dragTabIdRef = makeRef<TabId | null>(null);
      render(<TabItem {...defaultProps({ dragTabIdRef })} />);
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
      const dragTabIdRef = makeRef<TabId | null>(null);
      render(<TabItem {...defaultProps({ dragTabIdRef })} />);
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(getTabEl(), { dataTransfer });
      expect(dataTransfer.getData("text/plain")).toBe("tab-1");
    });

    it("resets lastSwapRef and lastSwapTimeRef", () => {
      const lastSwapRef = makeRef<{ targetId: TabId; position: string } | null>({
        targetId: "tab-2" as TabId,
        position: "after",
      });
      const lastSwapTimeRef = makeRef(12345);
      render(<TabItem {...defaultProps({ lastSwapRef, lastSwapTimeRef })} />);
      fireEvent.dragStart(getTabEl(), { dataTransfer: new DataTransfer() });
      expect(lastSwapRef.current).toBeNull();
      expect(lastSwapTimeRef.current).toBe(0);
    });
  });

  // ── DragOver handler ───────────────────────────────────────

  describe("handleDragOver", () => {
    it("sends TABS_REORDER when different tab is dragged over", () => {
      const dragTabIdRef = makeRef<TabId | null>("tab-2" as TabId);
      const onBeforeReorder = vi.fn();
      render(
        <TabItem
          {...defaultProps({
            dragTabIdRef,
            onBeforeReorder,
            isDragging: true,
          })}
        />,
      );

      // Mock getBoundingClientRect
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
      // clientY=130 > midpoint 120 → "after"
      fireEvent.dragOver(tabEl, { dataTransfer, clientY: 130 });

      expect(onBeforeReorder).toHaveBeenCalled();
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:reorder", {
        tabId: "tab-2",
        targetBookmarked: true,
        targetTabId: "tab-1",
        position: expect.stringMatching(/^(before|after)$/),
      });
    });

    it("does not reorder when dragged tab is same as target", () => {
      const dragTabIdRef = makeRef<TabId | null>("tab-1" as TabId);
      render(<TabItem {...defaultProps({ dragTabIdRef, isDragging: true })} />);

      fireEvent.dragOver(getTabEl(), {
        dataTransfer: new DataTransfer(),
        clientY: 130,
      });

      expect(mockSendCommand).not.toHaveBeenCalled();
    });

    it("throttles reorder calls within 100ms", () => {
      const dragTabIdRef = makeRef<TabId | null>("tab-2" as TabId);
      const lastSwapTimeRef = makeRef(Date.now()); // recent swap
      render(
        <TabItem
          {...defaultProps({
            dragTabIdRef,
            lastSwapTimeRef,
            isDragging: true,
          })}
        />,
      );

      fireEvent.dragOver(getTabEl(), {
        dataTransfer: new DataTransfer(),
        clientY: 130,
      });

      expect(mockSendCommand).not.toHaveBeenCalled();
    });

    it("detects before position when cursor in top half", () => {
      const dragTabIdRef = makeRef<TabId | null>("tab-2" as TabId);
      render(<TabItem {...defaultProps({ dragTabIdRef, isDragging: true })} />);

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
        clientY: 110, // top half
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
      render(<TabItem {...defaultProps()} />);
      const prevented = fireEvent.drop(getTabEl());
      // fireEvent returns false when preventDefault was called
      expect(prevented).toBe(false);
    });
  });

  // ── Exiting tab state ──────────────────────────────────────

  describe("exiting tab", () => {
    it("sets pointer-events to none", () => {
      render(<TabItem {...defaultProps({ exiting: true })} />);
      expect(getTabEl().style.pointerEvents).toBe("none");
    });

    it("has tab-out animation", () => {
      render(<TabItem {...defaultProps({ exiting: true })} />);
      expect(getTabEl().style.animation).toContain("tab-out");
    });

    it("is not draggable", () => {
      render(<TabItem {...defaultProps({ exiting: true })} />);
      expect(getTabEl().getAttribute("draggable")).toBe("false");
    });
  });

  // ── Ephemeral tab styling ──────────────────────────────────

  describe("ephemeral tab", () => {
    it("title has text-glass-text-muted class", () => {
      render(<TabItem {...defaultProps({ isEphemeral: true })} />);
      expect(getTitleSpan().className).toContain("text-glass-text-muted");
    });
  });

  // ── Click handler ──────────────────────────────────────────

  describe("click", () => {
    it("sends tabs:activate command", () => {
      render(<TabItem {...defaultProps()} />);
      fireEvent.click(getTabEl());
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:activate", { tabId: "tab-1" });
    });
  });

  // ── Close button ───────────────────────────────────────────

  describe("close button", () => {
    it("sends tabs:close command and stops propagation", () => {
      render(<TabItem {...defaultProps()} />);
      fireEvent.click(getCloseButton());
      expect(mockSendCommand).toHaveBeenCalledWith("tabs:close", { tabId: "tab-1" });
      // Should not also send tabs:activate (propagation stopped)
      expect(mockSendCommand).not.toHaveBeenCalledWith("tabs:activate", expect.anything());
    });
  });

  // ── Style transitions between states ───────────────────────

  describe("state transitions", () => {
    it("transitions from normal → dragging removes group and hover classes", () => {
      const { rerender } = render(<TabItem {...defaultProps()} />);
      expect(getTabEl().classList.contains("group")).toBe(true);
      expect(getTabEl().className).toContain("hover:bg-glass-hover");

      rerender(<TabItem {...defaultProps({ isDragging: true })} />);
      expect(getTabEl().classList.contains("group")).toBe(false);
      expect(getTabEl().className).not.toContain("hover:bg-glass-hover");
    });

    it("transitions from dragging → normal restores group and hover classes", () => {
      const { rerender } = render(<TabItem {...defaultProps({ isDragging: true })} />);
      expect(getTabEl().classList.contains("group")).toBe(false);

      rerender(<TabItem {...defaultProps({ isDragging: false })} />);
      expect(getTabEl().classList.contains("group")).toBe(true);
      expect(getTabEl().className).toContain("hover:bg-glass-hover");
    });

    it("transitions from isDragged → not isDragged removes drag styling", () => {
      const { rerender } = render(
        <TabItem {...defaultProps({ isDragging: true, isDragged: true })} />,
      );
      expect(getTabEl().style.background).toContain("oklch");
      expect(getTabEl().style.zIndex).toBe("10");

      rerender(<TabItem {...defaultProps({ isDragging: false, isDragged: false })} />);
      expect(getTabEl().style.background).toBe("");
      expect(getTabEl().style.zIndex).toBe("");
    });

    it("non-active, non-dragged tab during drag has no special background", () => {
      render(
        <TabItem {...defaultProps({ isActive: false, isDragging: true, isDragged: false })} />,
      );
      expect(getTabEl().style.background).toBe("");
      expect(getTabEl().style.boxShadow).toBe("");
    });
  });
});
