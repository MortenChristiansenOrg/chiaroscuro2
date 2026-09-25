import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useContextMenu } from "./ContextMenu";

const mouseEvent = () =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 12,
    clientY: 34,
  }) as unknown as React.MouseEvent;

describe("native context menu", () => {
  it.each([0, 1, 2, 3])(
    "dispatches leaf %i across a submenu and adjacent actions",
    async (index) => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn(), vi.fn()] as const;
      const send = vi.spyOn(window.chiaroscuro, "sendCommand").mockResolvedValue(index);
      const { result } = renderHook(useContextMenu);
      await act(async () => {
        result.current.open(
          [
            { label: "Before", onSelect: callbacks[0] },
            {
              label: "Move to workspace",
              submenu: [
                { label: "Personal", onSelect: callbacks[1] },
                { label: "Research", onSelect: callbacks[2] },
              ],
            },
            { label: "After", onSelect: callbacks[3] },
          ],
          mouseEvent(),
        );
      });
      expect(send).toHaveBeenCalledWith("context-menu:show", {
        x: 12,
        y: 34,
        items: [
          { label: "Before" },
          { label: "Move to workspace", submenu: [{ label: "Personal" }, { label: "Research" }] },
          { label: "After" },
        ],
      });
      callbacks.forEach((callback, i) => {
        expect(callback).toHaveBeenCalledTimes(i === index ? 1 : 0);
      });
      send.mockRestore();
    },
  );

  it("does not select an action when dismissed", async () => {
    const send = vi.spyOn(window.chiaroscuro, "sendCommand").mockResolvedValue(-1);
    const callback = vi.fn();
    const { result } = renderHook(useContextMenu);
    await act(async () =>
      result.current.open([{ label: "Action", onSelect: callback }], mouseEvent()),
    );
    expect(callback).not.toHaveBeenCalled();
    send.mockRestore();
  });
});
