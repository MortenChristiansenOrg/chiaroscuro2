import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import type { TabId } from "../../shared/types";
import { createMockPlatform } from "../../test-utils";
import ai, { type AiDeps } from "./ai.main";
import type { AiCommands, AiEvents } from "./ai.shared";
import type { AiProvider } from "./chatgpt-client.main";

function setup(sharing = true) {
  const commands = new CommandBus<AiCommands>();
  const events = new EventBus<AiEvents>();
  const dataStore = new MemoryDataStore();
  const tabId = "page" as TabId;
  const pages = new Map([[tabId, { url: "https://example.com/article" }]]);
  const platform = createMockPlatform({
    getTabUrl: vi.fn(() => pages.get(tabId)?.url),
    executeJavaScript: vi.fn(async () => "<h1>Article</h1>"),
  });
  let connected = true;
  const provider: AiProvider = {
    status: () => ({ connected, sharing: connected && sharing, account: "user@example.com" }),
    load: vi.fn(async () => {}),
    connect: vi.fn(async () => {
      connected = true;
      sharing = true;
    }),
    disconnect: vi.fn(async () => {
      connected = false;
    }),
    models: vi.fn(async () => [
      { slug: "gpt-6-luna", name: "GPT-6 Luna", efforts: ["low", "high"] },
    ]),
    respond: vi.fn(async () => "await copy(document.title);"),
  };
  const deps: AiDeps = {
    commands,
    events,
    dataStore,
    provider,
    platform,
    getActivePageTabId: () => tabId,
    getPageSnapshots: () => pages,
  };
  ai.register(deps);
  return { commands, events, dataStore, platform, provider, deps, pages, tabId };
}
const payload = {
  id: "00000000-0000-4000-8000-000000000001",
  domain: "example.com",
  request: "Copy title",
  source: "existing();",
};
afterEach(() => ai.teardown?.());
describe("shared AI connection", () => {
  it("keeps startup responsive during model discovery and ignores a stale catalog after sign-out", async () => {
    const { commands, provider } = setup();
    let complete: ((models: Awaited<ReturnType<AiProvider["models"]>>) => void) | undefined;
    vi.mocked(provider.models).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await ai.start?.();
    expect(provider.models).toHaveBeenCalled();
    expect((await commands.send("ai:get-state", {})).sharing).toBe(true);
    await commands.send("ai:disconnect", {});
    complete?.([{ slug: "gpt-6-luna", name: "GPT-6 Luna", efforts: ["high"] }]);
    await Promise.resolve();
    const state = await commands.send("ai:get-state", {});
    expect(state.sharing).toBe(false);
    expect(state.models).toEqual([]);
  });
  it("requires plan permission, then enables requests on connect and disables them on sign-out", async () => {
    const { commands, provider } = setup(false);
    await ai.start?.();
    await expect(commands.send("ai:generate-script", payload)).rejects.toThrow("allow plan usage");
    expect(provider.respond).not.toHaveBeenCalled();
    await commands.send("ai:connect", {});
    await expect(commands.send("ai:generate-script", payload)).resolves.toContain("copy");
    await commands.send("ai:disconnect", {});
    await expect(commands.send("ai:generate-script", payload)).rejects.toThrow("allow plan usage");
  });
  it("persists supported global defaults across restart and uses them for subsequent requests", async () => {
    const { commands, provider, deps, dataStore } = setup();
    await ai.start?.();
    expect((await commands.send("ai:get-state", {})).selection).toEqual({
      model: "gpt-6-luna",
      effort: "high",
    });
    await commands.send("ai:set-selection", { model: "gpt-6-luna", effort: "low" });
    ai.teardown?.();
    const restartedCommands = new CommandBus<AiCommands>();
    ai.register({ ...deps, commands: restartedCommands });
    await ai.start?.();
    expect(await dataStore.getSetting("ai-selection")).toEqual({
      model: "gpt-6-luna",
      effort: "low",
    });
    await restartedCommands.send("ai:generate-script", payload);
    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-6-luna", effort: "low" }),
    );
    await expect(
      restartedCommands.send("ai:set-selection", { model: "missing", effort: "ultra" }),
    ).rejects.toThrow("supported");
  });
  it("keeps an unavailable saved selection and blocks generation until a supported choice is made", async () => {
    const { commands, dataStore, provider } = setup();
    await dataStore.setSetting("ai-selection", { model: "removed-model", effort: "high" });
    await ai.start?.();
    expect((await commands.send("ai:get-state", {})).selection.model).toBe("removed-model");
    await expect(commands.send("ai:generate-script", payload)).rejects.toThrow("unavailable");
    expect(provider.respond).not.toHaveBeenCalled();
  });
  it("supplies existing code and page context without executing, saving, enabling, or copying the draft", async () => {
    const { commands, provider, platform, dataStore } = setup();
    await ai.start?.();
    const draft = await commands.send("ai:generate-script", payload);
    expect(draft).toBe("await copy(document.title);");
    expect(provider.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [expect.objectContaining({ content: expect.stringContaining("existing();") })],
      }),
    );
    expect(platform.executeWebsiteScript).not.toHaveBeenCalled();
    expect(platform.writeClipboard).not.toHaveBeenCalled();
    expect(await dataStore.getSetting("domain-scripts")).toBeUndefined();
  });
  it("cancels requests and rejects results if the page navigates while generating", async () => {
    const { commands, provider, pages, tabId } = setup();
    await ai.start?.();
    vi.mocked(provider.respond).mockImplementationOnce(async () => {
      pages.set(tabId, { url: "https://other.com" });
      return "bad();";
    });
    await expect(commands.send("ai:generate-script", payload)).rejects.toThrow("changed or closed");
    pages.set(tabId, { url: "https://example.com/article" });
    vi.mocked(provider.respond).mockImplementationOnce(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true });
        }),
    );
    const request = commands.send("ai:generate-script", payload);
    await vi.waitFor(() => expect(provider.respond).toHaveBeenCalledTimes(2));
    await commands.send("ai:cancel", { id: payload.id });
    await expect(request).rejects.toThrow("Generation stopped");
  });
  it("rejects unmatched domains before sending any page data", async () => {
    const { commands, provider } = setup();
    await ai.start?.();
    await expect(
      commands.send("ai:generate-script", { ...payload, domain: "other.com" }),
    ).rejects.toThrow("Open a page");
    expect(provider.respond).not.toHaveBeenCalled();
  });
});
