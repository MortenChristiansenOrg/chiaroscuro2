import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateNotification } from "./installer.renderer";
import { applyUpdate, subscribeToEvents, useInstallerStore } from "./installer.store";

const send = vi.mocked(window.chiaroscuro.sendCommand);
let listeners: Map<string, (payload: unknown) => void>;
let unsubscribe: () => void;

beforeEach(() => {
  send.mockReset().mockResolvedValue(undefined);
  useInstallerStore.setState({
    pendingUpdateVersion: "2.1.0",
    updateDownloaded: true,
    updateApplying: false,
    updateDismissed: false,
    updateError: null,
    protocolRequest: null,
  });
  listeners = new Map();
  unsubscribe = subscribeToEvents((name, callback) => {
    listeners.set(name, callback);
    return () => {
      listeners.delete(name);
    };
  });
});

afterEach(() => {
  cleanup();
  unsubscribe();
});

function emit(name: string, payload: unknown) {
  act(() => {
    listeners.get(name)?.(payload);
  });
}

describe("applying a downloaded update", () => {
  it("disables immediately, suppresses duplicate requests and stays pending after acknowledgement/remount", async () => {
    const request = Promise.withResolvers<void>();
    send.mockReturnValue(request.promise);
    const view = render(<UpdateNotification />);
    fireEvent.click(screen.getByRole("button", { name: "Restart to apply update" }));
    expect(
      screen.getByRole("button", { name: "Restarting to apply update" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Dismiss update notification" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Restarting…");
    await act(async () => {
      await applyUpdate();
      request.resolve();
      await request.promise;
    });
    expect(send).toHaveBeenCalledExactlyOnceWith("installer:apply-update", undefined);
    view.unmount();
    render(<UpdateNotification />);
    expect(
      screen.getByRole("button", { name: "Restarting to apply update" }).getAttribute("aria-busy"),
    ).toBe("true");
    emit("installer:update-dismissed", undefined);
    emit("installer:update-available", { version: "2.1.1" });
    expect(screen.getByRole("status").textContent).toBe("Restarting…");
  });

  it.each([
    new Error("Installer could not start"),
    { code: "HANDLER_ERROR", message: "Installer could not start" },
    "Installer could not start",
  ])("shows command rejection and allows retrying the downloaded installer (%#)", async (error) => {
    send.mockRejectedValueOnce(error);
    render(<UpdateNotification />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart to apply update" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Installer could not start");
    const retry = screen.getByRole("button", { name: "Restart to apply update" });
    expect(retry.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Restarting…");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("recovers from an updater error emitted after command acknowledgement", async () => {
    render(<UpdateNotification />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restart to apply update" }));
    });
    emit("installer:update-error", { message: "Cannot launch installer" });
    expect(screen.getByRole("alert").textContent).toBe("Cannot launch installer");
    expect(
      screen.getByRole("button", { name: "Restart to apply update" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByRole("button", { name: "Retry update" })).toBeNull();
  });

  it("keeps download retry separate and clears old errors when the download succeeds", async () => {
    useInstallerStore.setState({ updateDownloaded: false, updateError: "Download failed" });
    render(<UpdateNotification />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry update" }));
    });
    expect(send).toHaveBeenCalledExactlyOnceWith("installer:check-for-updates", undefined);
    emit("installer:update-downloaded", { version: "2.1.0" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Restart to apply update" })).toBeDefined();
  });
});
