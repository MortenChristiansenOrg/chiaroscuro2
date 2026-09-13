import { ipcMain } from "electron";
import { beforeEach, expect, it, vi } from "vitest";
import { CommandBus } from "./command-bus";
import { commandContracts } from "./command-contracts";
import { EventBus } from "./event-bus";
import { bridgeBusToIpc } from "./ipc-main-bridge";
import type { CommandRegistry, EventRegistry } from "./types";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

it("authorizes app main frames before validating payloads or invoking handlers", async () => {
  const bus = new CommandBus<CommandRegistry>(commandContracts);
  const handler = vi.fn();
  bus.handle("tabs:create", handler);
  const trusted = { mainFrame: {} } as Electron.WebContents;
  bridgeBusToIpc(
    bus,
    new EventBus<EventRegistry>(),
    () => [],
    (sender) => sender === trusted,
  );
  const invoke = vi.mocked(ipcMain.handle).mock.calls[0]![1];
  const call = (sender: Electron.WebContents, senderFrame: unknown, payload: unknown) =>
    invoke({ sender, senderFrame } as Electron.IpcMainInvokeEvent, "tabs:create", payload);
  expect(await call({} as Electron.WebContents, {}, {})).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await call(trusted, {}, { url: "https://example.com" })).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await call(trusted, trusted.mainFrame, { url: 42 })).toMatchObject({
    ok: false,
    error: { code: "INVALID_PAYLOAD", issues: [expect.objectContaining({ path: ["url"] })] },
  });
  expect(handler).not.toHaveBeenCalled();
  expect(await call(trusted, trusted.mainFrame, { url: "https://example.com" })).toMatchObject({
    ok: true,
  });
  expect(handler).toHaveBeenCalledOnce();
});
