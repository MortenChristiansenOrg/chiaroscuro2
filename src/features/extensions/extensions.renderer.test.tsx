import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExtensionsPage from "./extensions.renderer";
import { BITWARDEN_ID, type InstalledExtension } from "./extensions.shared";
import { useExtensionsStore } from "./extensions.store";

const pending: InstalledExtension = {
  id: BITWARDEN_ID,
  name: "Bitwarden Password Manager",
  version: "",
  installed: false,
  enabled: false,
  updateVersion: "2026.8.0",
  review: { token: "reviewed-package", permissions: ["tabs", "*://*/*", "clipboardRead"] },
};
beforeEach(() => {
  useExtensionsStore.setState({ extensions: [], error: undefined });
  vi.mocked(window.chiaroscuro.sendCommand).mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it("keeps branding and requires explicit approval after downloading", async () => {
  let finishDownload!: () => void;
  vi.mocked(window.chiaroscuro.sendCommand).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishDownload = resolve;
      }),
  );
  render(<ExtensionsPage />);
  const card = screen.getByRole("article", { name: "Install Bitwarden" });
  expect(card.querySelector("img")?.getAttribute("src")).toContain("bitwarden.png");
  fireEvent.click(screen.getByRole("button", { name: "Review and install" }));
  expect(screen.getByRole("status").textContent).toContain(
    "Nothing is installed until you approve",
  );
  expect(screen.queryByRole("button", { name: "Approve and install" })).toBeNull();
  await act(async () => {
    useExtensionsStore.setState({ extensions: [pending] });
    finishDownload();
  });
  expect(screen.getByRole("region", { name: "Extension permissions" }).textContent).toContain(
    "Read and change data on all websites",
  );
  expect(window.chiaroscuro.sendCommand).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Approve and install" }));
  expect(window.chiaroscuro.sendCommand).toHaveBeenLastCalledWith("extensions:approve", {
    extensionId: BITWARDEN_ID,
    token: "reviewed-package",
  });
});

it("shows download errors with retry and allows cancelling the staged package directly", async () => {
  useExtensionsStore.setState({
    extensions: [{ ...pending, review: undefined, error: "Download failed" }],
  });
  render(<ExtensionsPage />);
  expect(screen.getByRole("alert").textContent).toBe("Download failed");
  fireEvent.click(screen.getByRole("button", { name: "Retry download" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancel installation" })).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel installation" }));
  expect(window.chiaroscuro.sendCommand).toHaveBeenLastCalledWith("extensions:uninstall", {
    extensionId: BITWARDEN_ID,
  });
  expect(screen.queryByText(/Local vault data/)).toBeNull();
});

it("exposes an accessible enable switch and opens the installed extension", () => {
  useExtensionsStore.setState({
    extensions: [
      {
        ...pending,
        installed: true,
        enabled: true,
        loaded: true,
        review: undefined,
        action: { popup: "popup.html", title: "Bitwarden", iconUrl: "" },
      },
    ],
  });
  render(<ExtensionsPage />);
  const toggle = screen.getByRole("switch", { name: "Enable extension", checked: true });
  fireEvent.click(toggle);
  expect(window.chiaroscuro.sendCommand).toHaveBeenLastCalledWith("extensions:set-enabled", {
    extensionId: BITWARDEN_ID,
    enabled: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "Open Bitwarden" }));
  expect(window.chiaroscuro.sendCommand).toHaveBeenLastCalledWith("extensions:open-popup", {
    extensionId: BITWARDEN_ID,
  });
});
