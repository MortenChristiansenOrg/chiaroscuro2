import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TabId } from "../../shared/types";
import { DomainScriptEditor } from "./DomainScriptEditor";
import { DomainScriptsSection } from "./DomainScriptsSection";
import type { DomainScript } from "./domain-scripts.shared";
import {
  loadDomainScripts,
  subscribeToEvents,
  useDomainScriptsStore,
} from "./domain-scripts.store";

const example: DomainScript = {
  id: "script-1",
  domain: "example.com",
  name: "Copy heading",
  source: "await copy(document.querySelector('h1').textContent);",
  enabled: true,
  runAt: "manual",
  pathPattern: "/*",
  alias: "/copy-heading",
  shortcut: "Alt+Shift+C",
};

beforeEach(() => {
  useDomainScriptsStore.setState({ scriptsByDomain: new Map(), results: new Map() });
  vi.mocked(window.chiaroscuro.sendCommand).mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

it("preserves the draft and focus when saving fails, and removes manual bindings on page-load save", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error("Invalid JavaScript syntax"));
  render(
    <DomainScriptEditor
      domain={example.domain}
      script={example}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Changed title" } });
  fireEvent.click(screen.getByRole("button", { name: "Save script" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Invalid JavaScript syntax"),
  );
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Changed title");
  fireEvent.change(screen.getByLabelText("Run"), { target: { value: "page-load" } });
  expect(screen.queryByLabelText("Alias (optional)")).toBeNull();
  save.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Save script" }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith({
      ...example,
      name: "Changed title",
      runAt: "page-load",
      alias: "",
      shortcut: "",
    }),
  );
});

it("creates a script through explicit save and restores focus after cancel", async () => {
  render(<DomainScriptsSection domain="example.com" />);
  await screen.findByText("No scripts yet. Add an action or automate a page change.");
  fireEvent.click(screen.getByRole("button", { name: "Add script" }));
  expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Copy title" } });
  expect(window.chiaroscuro.sendCommand).not.toHaveBeenCalledWith(
    "domain-scripts:save",
    expect.anything(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save script" }));
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("domain-scripts:save", {
      script: expect.objectContaining({
        domain: "example.com",
        name: "Copy title",
        runAt: "manual",
        enabled: true,
      }),
    }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add script" })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add script" }));
  fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
  expect(screen.queryByRole("form", { name: "New script" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add script" }));
});

it("uses main-process events for toggles, shows failures, and removes the correct script", async () => {
  const listeners = new Map<string, (payload: unknown) => void>();
  const unsubscribe = subscribeToEvents((name, callback) => {
    listeners.set(name, callback);
    return () => {
      listeners.delete(name);
    };
  });
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValueOnce([example]);
  render(<DomainScriptsSection domain="example.com" />);
  const card = await screen.findByRole("article", { name: example.name });
  fireEvent.click(within(card).getByRole("switch", { name: `Enable ${example.name}` }));
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenLastCalledWith("domain-scripts:save", {
      script: { ...example, enabled: false },
    }),
  );
  expect(within(card).getByRole("switch").getAttribute("aria-checked")).toBe("true");
  act(() => {
    listeners.get("domain-scripts:changed")?.({
      domain: example.domain,
      scripts: [{ ...example, enabled: false }],
    });
    listeners.get("domain-scripts:executed")?.({
      id: example.id,
      domain: example.domain,
      tabId: "tab-1" as TabId,
      status: "failed",
      error: "Heading not found",
    });
  });
  expect(within(card).getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect(within(card).getByRole("alert").textContent).toBe("Last run failed: Heading not found");
  fireEvent.click(within(card).getByRole("button", { name: `Delete ${example.name}` }));
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenLastCalledWith("domain-scripts:remove", {
      id: example.id,
    }),
  );
  act(() => listeners.get("domain-scripts:changed")?.({ domain: example.domain, scripts: [] }));
  expect(screen.queryByRole("article")).toBeNull();
  expect(useDomainScriptsStore.getState().results.has(example.id)).toBe(false);
  unsubscribe();
  expect(listeners.size).toBe(0);
});

it("keeps newer changed events when an older list request finishes", async () => {
  let resolveList!: (scripts: DomainScript[]) => void;
  vi.mocked(window.chiaroscuro.sendCommand).mockImplementationOnce(
    () =>
      new Promise<DomainScript[]>((resolve) => {
        resolveList = resolve;
      }),
  );
  const listeners = new Map<string, (payload: unknown) => void>();
  const unsubscribe = subscribeToEvents((name, callback) => {
    listeners.set(name, callback);
    return () => listeners.delete(name);
  });
  const loading = loadDomainScripts(example.domain);
  listeners.get("domain-scripts:changed")?.({ domain: example.domain, scripts: [example] });
  resolveList([]);
  await loading;
  expect(useDomainScriptsStore.getState().scriptsByDomain.get(example.domain)).toEqual([example]);
  unsubscribe();
});

it("shows command errors without silently changing the cached enabled state", async () => {
  vi.mocked(window.chiaroscuro.sendCommand)
    .mockResolvedValueOnce([example])
    .mockRejectedValueOnce(new Error("Could not save scripts"));
  render(<DomainScriptsSection domain="example.com" />);
  const toggle = await screen.findByRole("switch", { name: `Enable ${example.name}` });
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Could not save scripts"));
  expect(toggle.getAttribute("aria-checked")).toBe("true");
});
