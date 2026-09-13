import { expect, expectTypeOf, it, vi } from "vitest";
import type { WorkspacesCommands } from "../features/workspaces/workspaces.shared";
import type { WorkspaceId } from "../shared/types";
import { CommandBus } from "./command-bus";
import { commandContracts } from "./command-contracts";
import { executeExternalCommand } from "./command-validation";
import { IpcRendererCommandBus } from "./ipc-renderer-bus";

it("typed IPC input may omit defaults while internal handlers receive booleans", async () => {
  const bus = new CommandBus<WorkspacesCommands>(commandContracts);
  const handler = vi.fn((payload: WorkspacesCommands["workspaces:create"]["payload"]) => {
    expectTypeOf(payload.privacyMode).toEqualTypeOf<boolean>();
    return "created-workspace" as WorkspaceId;
  });
  bus.handle("workspaces:create", handler);
  vi.stubGlobal("window", {
    chiaroscuro: {
      sendCommand: async (name: string, payload: unknown) => {
        const result = await executeExternalCommand(bus, name, payload);
        if (!result.ok) throw result.error;
        return result.response;
      },
    },
  });
  try {
    const renderer = new IpcRendererCommandBus<WorkspacesCommands>();
    await expect(
      renderer.send("workspaces:create", {
        name: "Work",
        color: "blue",
        icon: "W",
      }),
    ).resolves.toBe("created-workspace");
    expect(handler).toHaveBeenCalledWith({
      name: "Work",
      color: "blue",
      icon: "W",
      privacyMode: false,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
