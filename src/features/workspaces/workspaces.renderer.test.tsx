import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "../../shared/types";
import { makeWorkspace } from "../../test-utils";
import {
  WORKSPACE_COLORS,
  WorkspaceBubble,
  WorkspaceEditor,
  WorkspaceSwitcher,
} from "./workspaces.renderer";

// Mock FA_SOLID_SEARCH for icon search tests
vi.mock("../../shared/fa-icon-search.generated", () => ({
  FA_SOLID_SEARCH: [
    ["house", "house home"],
    ["star", "star favorite"],
    ["heart", "heart love"],
    ["gear", "gear settings cog"],
  ],
}));

const mockSendCommand = vi.fn(() => Promise.resolve());

beforeEach(() => {
  mockSendCommand.mockClear();
  Object.defineProperty(window, "chiaroscuro", {
    value: { ...window.chiaroscuro, sendCommand: mockSendCommand },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WorkspaceBubble", () => {
  it("renders workspace icon text", () => {
    const ws = makeWorkspace({ icon: "W" });
    render(<WorkspaceBubble workspace={ws} isActive={false} />);
    expect(screen.getByText("W")).toBeDefined();
  });

  it("click sends switch command", () => {
    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId });
    render(<WorkspaceBubble workspace={ws} isActive={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockSendCommand).toHaveBeenCalledWith("workspaces:switch", { workspaceId: "ws-1" });
  });

  it("double-click calls onEdit", () => {
    const ws = makeWorkspace();
    const onEdit = vi.fn();
    render(<WorkspaceBubble workspace={ws} isActive={false} onEdit={onEdit} />);
    fireEvent.doubleClick(screen.getByRole("button"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("active workspace has scale(1.1)", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={true} />);
    expect(screen.getByRole("button").style.transform).toBe("scale(1.1)");
  });

  it("inactive workspace has scale(0.75)", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={false} />);
    expect(screen.getByRole("button").style.transform).toBe("scale(0.75)");
  });

  it("inactive workspace has opacity 0.7", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={false} />);
    expect(screen.getByRole("button").style.opacity).toBe("0.7");
  });

  it("active workspace has opacity 1", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={true} />);
    expect(screen.getByRole("button").style.opacity).toBe("1");
  });

  it("has drop shadow for depth", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={true} />);
    expect(screen.getByRole("button").style.filter).toContain("drop-shadow");
  });

  it("hover scales to 1.2 and sets full opacity", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={false} />);
    const bubble = screen.getByRole("button");

    fireEvent.mouseEnter(bubble);
    expect(bubble.style.transform).toBe("scale(1.2)");
    expect(bubble.style.opacity).toBe("1");

    fireEvent.mouseLeave(bubble);
    expect(bubble.style.transform).toBe("scale(0.75)");
    expect(bubble.style.opacity).toBe("0.7");
  });

  it("has transparent background", () => {
    const ws = makeWorkspace({ color: "oklch(0.6 0.12 230)" });
    render(<WorkspaceBubble workspace={ws} isActive={true} />);
    expect(screen.getByRole("button").style.background).toBe("transparent");
  });

  it("sets aria-current on active workspace", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={true} />);
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });

  it("does not set aria-current on inactive workspace", () => {
    const ws = makeWorkspace();
    render(<WorkspaceBubble workspace={ws} isActive={false} />);
    expect(screen.getByRole("button").getAttribute("aria-current")).toBeNull();
  });
});

describe("WorkspaceEditor", () => {
  it("renders Add button for new workspace", () => {
    render(<WorkspaceEditor onClose={vi.fn()} />);
    expect(screen.getByText("Add")).toBeDefined();
  });

  it("renders Save button for existing workspace", () => {
    const ws = makeWorkspace();
    render(<WorkspaceEditor workspace={ws} onClose={vi.fn()} />);
    expect(screen.getByText("Save")).toBeDefined();
  });

  it("form submit creates workspace", () => {
    const onClose = vi.fn();
    render(<WorkspaceEditor onClose={onClose} />);

    // Fill in name
    const nameInput = screen.getByPlaceholderText("Workspace name");
    fireEvent.change(nameInput, { target: { value: "Personal" } });

    // Submit
    fireEvent.click(screen.getByText("Add"));

    expect(mockSendCommand).toHaveBeenCalledWith(
      "workspaces:create",
      expect.objectContaining({ name: "Personal" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("form submit updates existing workspace", () => {
    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Work" });
    const onClose = vi.fn();
    render(<WorkspaceEditor workspace={ws} onClose={onClose} />);

    const nameInput = screen.getByPlaceholderText("Workspace name");
    fireEvent.change(nameInput, { target: { value: "Office" } });
    fireEvent.click(screen.getByText("Save"));

    expect(mockSendCommand).toHaveBeenCalledWith("workspaces:update", {
      workspaceId: "ws-1",
      changes: expect.objectContaining({ name: "Office" }),
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not submit with empty name", () => {
    render(<WorkspaceEditor onClose={vi.fn()} />);

    // Name is empty by default for new workspace
    fireEvent.click(screen.getByText("Add"));

    expect(mockSendCommand).not.toHaveBeenCalledWith("workspaces:create", expect.anything());
  });

  it("delete confirms before deleting", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Work" });
    const onClose = vi.fn();
    render(<WorkspaceEditor workspace={ws} onClose={onClose} />);

    fireEvent.click(screen.getByText("Delete"));

    expect(confirmSpy).toHaveBeenCalledWith('Delete workspace "Work"?');
    expect(mockSendCommand).toHaveBeenCalledWith("workspaces:delete", { workspaceId: "ws-1" });
    expect(onClose).toHaveBeenCalled();
  });

  it("delete does nothing when cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const ws = makeWorkspace({ id: "ws-1" as WorkspaceId });
    render(<WorkspaceEditor workspace={ws} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Delete"));

    expect(mockSendCommand).not.toHaveBeenCalledWith("workspaces:delete", expect.anything());
  });

  it("escape calls onClose", () => {
    const onClose = vi.fn();
    render(<WorkspaceEditor onClose={onClose} />);

    fireEvent.keyDown(
      screen.getByPlaceholderText("Workspace name").closest("form") as HTMLElement,
      {
        key: "Escape",
      },
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("cancel button calls onClose", () => {
    const onClose = vi.fn();
    render(<WorkspaceEditor onClose={onClose} />);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("auto-derives icon from name", () => {
    render(<WorkspaceEditor onClose={vi.fn()} />);

    const nameInput = screen.getByPlaceholderText("Workspace name");
    fireEvent.change(nameInput, { target: { value: "Personal" } });

    // Icon preview should show "P"
    const iconInput = screen.getByDisplayValue("P");
    expect(iconInput).toBeDefined();
  });

  it("does not render color swatches", () => {
    render(<WorkspaceEditor onClose={vi.fn()} />);

    // Color swatches are hidden (color still stored internally)
    const colorButtons = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Color"));
    expect(colorButtons.length).toBe(0);
  });

  it("no delete button for new workspace", () => {
    render(<WorkspaceEditor onClose={vi.fn()} />);
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("shows delete button for existing workspace", () => {
    const ws = makeWorkspace();
    render(<WorkspaceEditor workspace={ws} onClose={vi.fn()} />);
    expect(screen.getByText("Delete")).toBeDefined();
  });
});

describe("WorkspaceSwitcher", () => {
  it("renders workspace bubbles", () => {
    const ws1 = makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Work", icon: "W" });
    const ws2 = makeWorkspace({ id: "ws-2" as WorkspaceId, name: "Personal", icon: "P" });
    render(
      <WorkspaceSwitcher
        workspaces={[ws1, ws2]}
        activeWorkspaceId={"ws-1" as WorkspaceId}
        editorMode="none"
        onEditorModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("W")).toBeDefined();
    expect(screen.getByText("P")).toBeDefined();
  });

  it("right-click bubble shows edit context menu", () => {
    const ws1 = makeWorkspace({ id: "ws-1" as WorkspaceId, name: "Work" });
    render(
      <WorkspaceSwitcher
        workspaces={[ws1]}
        activeWorkspaceId={"ws-1" as WorkspaceId}
        editorMode="none"
        onEditorModeChange={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Work" }));
    expect(mockSendCommand).toHaveBeenCalledWith(
      "context-menu:show",
      expect.objectContaining({
        items: [
          expect.objectContaining({ label: "Edit workspace", icon: "pencil" }),
          expect.objectContaining({ label: "Add workspace", icon: "plus" }),
        ],
      }),
    );
  });

  it("right-click empty area shows add context menu", () => {
    render(
      <WorkspaceSwitcher
        workspaces={[]}
        activeWorkspaceId={null}
        editorMode="none"
        onEditorModeChange={vi.fn()}
      />,
    );

    // Right-click the outer container (empty area)
    const container = screen.getByTestId("workspace-switcher");
    fireEvent.contextMenu(container);
    expect(mockSendCommand).toHaveBeenCalledWith(
      "context-menu:show",
      expect.objectContaining({
        items: [expect.objectContaining({ label: "Add workspace", icon: "plus" })],
      }),
    );
  });
});
