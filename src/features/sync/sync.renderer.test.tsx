import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncIssueList } from "./SyncIssueList";
import { SyncSettingsSection } from "./SyncSettingsSection";
import { DISCONNECTED_SYNC_STATE, type SyncState } from "./sync.shared";
import { useSyncStore } from "./sync.store";

const connected: SyncState = {
  connected: true,
  serviceUrl: "https://sync.example",
  syncing: false,
  readOnly: false,
  lastSyncedAt: Date.UTC(2026, 10, 19, 12, 0),
  issues: [],
};

beforeEach(() => {
  useSyncStore.setState({ state: DISCONNECTED_SYNC_STATE, loaded: true });
  vi.mocked(window.chiaroscuro.sendCommand).mockReset();
});
afterEach(cleanup);

it("connects with the entered address and key, and clears the key afterwards", async () => {
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue(undefined);
  render(<SyncSettingsSection />);
  fireEvent.change(screen.getByLabelText("Service URL"), {
    target: { value: "https://sync.example" },
  });
  const key = screen.getByLabelText("Key for this machine");
  expect(key).toHaveAttribute("type", "password");
  fireEvent.change(key, { target: { value: "ads_secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("sync:connect", {
      url: "https://sync.example",
      apiKey: "ads_secret",
    }),
  );
  await waitFor(() => expect(key).toHaveValue(""));
});

it("keeps the form filled in and shows why connecting failed", async () => {
  vi.mocked(window.chiaroscuro.sendCommand).mockRejectedValue(
    new Error("The sync service didn't accept this machine's key."),
  );
  render(<SyncSettingsSection />);
  fireEvent.change(screen.getByLabelText("Service URL"), {
    target: { value: "https://sync.example" },
  });
  fireEvent.change(screen.getByLabelText("Key for this machine"), {
    target: { value: "ads_wrong" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("didn't accept this machine's key");
  expect(screen.getByLabelText("Key for this machine")).toHaveValue("ads_wrong");
  await waitFor(() => expect(screen.getByLabelText("Service URL")).toHaveFocus());
});

it("shows the connection, the last sync, read-only keys and errors", () => {
  useSyncStore.setState({
    state: {
      ...connected,
      readOnly: true,
      error: "Couldn't reach the sync service.",
      lastFailedAt: Date.UTC(2026, 10, 19, 12, 5),
    },
  });
  render(<SyncSettingsSection />);
  expect(screen.getByRole("status")).toHaveTextContent("Sync isn't working right now");
  expect(screen.getByText(/^Last synced .* · Last failed /)).toBeVisible();
  expect(screen.getByText("Service: https://sync.example")).toBeVisible();
  expect(screen.getByText(/can only read/)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the sync service.");
  expect(screen.queryByLabelText("Service URL")).not.toBeInTheDocument();
});

it("syncs now on request, but not while a sync runs", async () => {
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue(undefined);
  useSyncStore.setState({ state: { ...connected, syncing: true } });
  const { rerender } = render(<SyncSettingsSection />);
  expect(screen.getByRole("status")).toHaveTextContent("Syncing…");
  const syncNow = screen.getByRole("button", { name: "Sync now" });
  expect(syncNow).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(syncNow);
  expect(window.chiaroscuro.sendCommand).not.toHaveBeenCalled();
  useSyncStore.setState({ state: connected });
  rerender(<SyncSettingsSection />);
  expect(screen.getByRole("status")).toHaveTextContent("Connected");
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  await waitFor(() => expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("sync:now", {}));
});

it("asks before disconnecting, and moves focus to the form afterwards", async () => {
  vi.mocked(window.chiaroscuro.sendCommand).mockImplementation(async () => {
    useSyncStore.setState({ state: DISCONNECTED_SYNC_STATE });
  });
  useSyncStore.setState({ state: connected });
  render(<SyncSettingsSection />);
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(screen.getByRole("group", { name: /Stop syncing on this machine\?/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(window.chiaroscuro.sendCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop syncing" }));
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("sync:disconnect", {}),
  );
  await waitFor(() => expect(screen.getByLabelText("Service URL")).toHaveFocus());
});

it("shows Loading until the real state arrives", () => {
  useSyncStore.setState({ state: DISCONNECTED_SYNC_STATE, loaded: false });
  render(<SyncSettingsSection />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  expect(screen.queryByLabelText("Service URL")).not.toBeInTheDocument();
});

it("offers both versions for a conflict and only explains other problems", async () => {
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue(undefined);
  useSyncStore.setState({
    state: {
      ...connected,
      issues: [
        {
          id: "domains/example.com",
          label: "example.com styles and navigation rules",
          kind: "conflict",
          message: "Changed on this machine and on another.",
          version: "2:abc",
        },
        {
          id: "scripts/big",
          label: "Script “Big” on example.com",
          kind: "too-large",
          message: "Too large to sync. It stays on this machine.",
        },
      ],
    },
  });
  render(<SyncSettingsSection />);
  const list = screen.getByRole("list", { name: "Needs attention" });
  expect(list.querySelectorAll("li")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Keep this machine's version" })).toHaveLength(1);
  expect(
    screen.getByRole("group", { name: "example.com styles and navigation rules" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Use the other machine's version" }));
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("sync:resolve", {
      id: "domains/example.com",
      keep: "other-machine",
      version: "2:abc",
    }),
  );
});

it("renders nothing without issues", () => {
  const { container } = render(<SyncIssueList issues={[]} onResolve={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
