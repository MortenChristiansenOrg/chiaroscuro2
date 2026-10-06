import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DomainScriptEditor } from "../domain-scripts/DomainScriptEditor";
import { AiRequestPanel } from "./AiRequestPanel";
import { AiSettingsSection } from "./AiSettingsSection";
import { useAiStore } from "./ai.store";

beforeEach(() => {
  useAiStore.setState({
    state: {
      connected: true,
      sharing: true,
      connecting: false,
      account: "person@example.com",
      models: [{ slug: "gpt-6-luna", name: "GPT-6 Luna", efforts: ["low", "high"] }],
      selection: { model: "gpt-6-luna", effort: "high" },
    },
  });
  vi.mocked(window.chiaroscuro.sendCommand).mockReset();
});
afterEach(cleanup);
it("enables the reported GPT-5.6 choices, preserves High, and lets unknown models use their default", async () => {
  useAiStore.setState((s) => ({
    state: {
      ...s.state,
      models: [
        { slug: "gpt-5.6-sol", name: "GPT-5.6 Sol", efforts: ["low", "high"] },
        { slug: "gpt-5.6-terra", name: "GPT-5.6 Terra", efforts: ["low", "high"] },
        { slug: "gpt-5.6-luna", name: "GPT-5.6 Luna", efforts: ["low", "high"] },
        { slug: "future-model", name: "Future model", efforts: ["default"] },
      ],
    },
  }));
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue(undefined);
  render(<AiSettingsSection />);
  for (const name of ["GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna", "Future model"])
    expect(screen.getByRole("option", { name })).toBeEnabled();
  expect(screen.getByText(/Your saved model or effort is unavailable/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "gpt-5.6-sol" } });
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("ai:set-selection", {
      model: "gpt-5.6-sol",
      effort: "high",
    }),
  );
  fireEvent.change(screen.getByLabelText("AI model"), { target: { value: "future-model" } });
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("ai:set-selection", {
      model: "future-model",
      effort: "default",
    }),
  );
  act(() =>
    useAiStore.setState((s) => ({
      state: { ...s.state, selection: { model: "future-model", effort: "default" } },
    })),
  );
  expect(screen.getByRole("option", { name: "Model default" })).toBeVisible();
  expect(screen.getByText(/Requests use its default/)).toBeVisible();
});
it("explains how to connect and responds to sign-out", async () => {
  render(<AiRequestPanel domain="example.com" kind="script" />);
  expect(screen.getByRole("button", { name: "Generate draft" })).toBeDisabled();
  act(() => {
    useAiStore.setState((s) => ({ state: { ...s.state, sharing: false, connected: false } }));
  });
  expect(screen.queryByRole("button", { name: "Generate draft" })).toBeNull();
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Open AI settings" }));
  expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("settings:open", undefined);
});
it("updates only JavaScript in the editable draft and saves only on explicit Save", async () => {
  const script = {
    id: "script",
    domain: "example.com",
    name: "Action",
    source: "old();",
    enabled: false,
    runAt: "manual" as const,
    pathPattern: "/article/*",
    alias: "/action",
    shortcut: "Alt+Shift+Y",
  };
  const save = vi.fn(async () => {});
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue("await copy(document.title);");
  render(
    <DomainScriptEditor domain={script.domain} script={script} onSave={save} onCancel={() => {}} />,
  );
  fireEvent.change(screen.getByLabelText("Describe the change"), {
    target: { value: "Copy title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
  await waitFor(() =>
    expect(screen.getByLabelText("JavaScript")).toHaveValue("await copy(document.title);"),
  );
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save script" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...script, source: "await copy(document.title);" }),
  );
});
it("keeps the request and existing draft on failure", async () => {
  const draft = vi.fn();
  vi.mocked(window.chiaroscuro.sendCommand).mockRejectedValue({
    code: "COMMAND_FAILED",
    message: "Usage limit reached. Manage usage in Settings.",
  });
  render(<AiRequestPanel domain="example.com" kind="script" source="old();" onDraft={draft} />);
  fireEvent.change(screen.getByLabelText("Describe the change"), {
    target: { value: "Copy title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Usage limit reached. Manage usage in Settings.",
  );
  expect(screen.getByLabelText("Describe the change")).toHaveValue("Copy title");
  expect(draft).not.toHaveBeenCalled();
});
it("shows the account and offers only supported reasoning efforts", async () => {
  render(<AiSettingsSection />);
  expect(screen.getByRole("status")).toHaveTextContent("person@example.com");
  expect(screen.getByLabelText("AI reasoning effort").querySelectorAll("option")).toHaveLength(2);
  vi.mocked(window.chiaroscuro.sendCommand).mockResolvedValue(undefined);
  fireEvent.change(screen.getByLabelText("AI reasoning effort"), { target: { value: "low" } });
  await waitFor(() =>
    expect(window.chiaroscuro.sendCommand).toHaveBeenCalledWith("ai:set-selection", {
      model: "gpt-6-luna",
      effort: "low",
    }),
  );
});
