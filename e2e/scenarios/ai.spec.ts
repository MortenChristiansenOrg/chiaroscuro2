import type { AiProvider } from "../../src/features/ai/chatgpt-client.main";
import { startSite } from "../automation/site";
import { expect, test } from "../fixtures/electron-app";
import { VerificationPage } from "../pages/verification.page";
import { WindowChromePage } from "../pages/window-chrome.page";

let site: Awaited<ReturnType<typeof startSite>>;
test.beforeAll(async () => {
  site = await startSite();
});
test.afterAll(async () => {
  await site.close();
});

test("AI settings and generated drafts use the real app with a simulated ChatGPT provider", async ({
  appSession: session,
}) => {
  test.setTimeout(120000);
  const url = `${site.url}/scripts/initial`;
  await VerificationPage.navigate(session, url);
  await session.command("settings:open", undefined);
  const ai = session.shell.locator("#settings-ai");
  await expect(ai.getByRole("button", { name: "Continue with ChatGPT" })).toBeVisible();
  await session.app.evaluate(() => {
    const provider = (globalThis as unknown as { __testHooks: { aiProvider: AiProvider } })
      .__testHooks.aiProvider;
    let connected = false;
    provider.status = () => ({
      connected,
      sharing: connected,
      account: connected ? "fixture@example.com" : undefined,
    });
    provider.connect = async () => {
      connected = true;
    };
    provider.disconnect = async () => {
      connected = false;
    };
    provider.models = async () => [
      { slug: "gpt-6-luna", name: "GPT-6 Luna", efforts: ["low", "high"] },
    ];
    provider.respond = async (options) => {
      if (options.instructions.startsWith("Write a JavaScript"))
        return "await copy(document.title);";
      if (
        options.instructions.startsWith("Write the complete") &&
        JSON.stringify(options.input).includes("Load a remote background")
      )
        return "body { background: url(https://attacker.example/image); }";
      if (
        options.instructions.startsWith("Write the complete") &&
        JSON.stringify(options.input).includes("Wait forever")
      )
        return new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        });
      if (options.instructions.startsWith("Write the complete"))
        return "h1 { color: rgb(180, 30, 70) !important; }";
      return "The heading color changed as requested.";
    };
  });
  await ai.getByRole("button", { name: "Continue with ChatGPT" }).click();
  await expect(ai.getByRole("status")).toContainText("Using ChatGPT plan");
  await expect(ai.getByRole("combobox", { name: "AI model" })).toHaveValue("gpt-6-luna");
  await ai.getByRole("combobox", { name: "AI reasoning effort" }).selectOption("low");
  await expect(ai.getByRole("combobox", { name: "AI reasoning effort" })).toHaveValue("low");
  await session.capture("ai-settings-connected");

  await session.command("domain-settings:open", { domain: "127.0.0.1" });
  const scripts = session.shell.locator("#domain-settings-scripts");
  await scripts.getByRole("button", { name: "Add script", exact: true }).click();
  const form = scripts.getByRole("form", { name: "New script", exact: true });
  await form.getByRole("textbox", { name: "Name", exact: true }).fill("Generated draft");
  await form.getByRole("textbox", { name: "Describe the change" }).fill("Copy the page title");
  await form.getByRole("button", { name: "Generate draft" }).click();
  await expect(form.getByRole("textbox", { name: "JavaScript", exact: true })).toHaveValue(
    "await copy(document.title);",
  );
  expect(await session.command("domain-scripts:list", { domain: "127.0.0.1" })).toEqual([]);
  await session.capture("ai-script-draft");
  await form.getByRole("button", { name: "Save script" }).click();
  await expect(scripts.getByRole("article", { name: "Generated draft" })).toBeVisible();

  const css = session.shell.locator("#domain-settings-css");
  const cssRequest = css.getByRole("textbox", { name: "Describe the change" });
  await cssRequest.fill("Load a remote background");
  await css.getByRole("button", { name: "Generate and verify CSS" }).click();
  await expect(css.getByRole("alert")).toContainText("remote resource references");
  await expect(cssRequest).toHaveValue("Load a remote background");
  expect(await session.command("domain-css:get-state", { domain: "127.0.0.1" })).toMatchObject({
    enabled: false,
    hasFile: false,
  });
  await cssRequest.fill("Wait forever");
  await css.getByRole("button", { name: "Generate and verify CSS" }).click();
  await expect(css.getByRole("status")).toContainText("Writing domain CSS");
  await css.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(css.getByRole("alert")).toContainText("Generation stopped");
  await expect(cssRequest).toHaveValue("Wait forever");
  await cssRequest.fill("Make the heading pink");
  await css.getByRole("button", { name: "Generate and verify CSS" }).click();
  await expect(css.getByRole("status")).toContainText("CSS saved.");
  await expect(css.getByRole("button", { name: "Restore previous CSS" })).toBeVisible();
  const target = await session.target((target) => target.url === url && target.kind === "tab");
  await session.shell.locator(`[data-tab-id="${target.tabId}"]`).click();
  const page = await session.page(target);
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");
  await session.capture("ai-css-applied");
  await new WindowChromePage(session.shell).reloadButton.click();
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");

  await session.restart();
  const state = (await session.command("ai:get-state", {})) as {
    selection: { model: string; effort: string };
  };
  expect(state.selection).toEqual({ model: "gpt-6-luna", effort: "low" });
  await session.command("domain-settings:open", { domain: "127.0.0.1" });
  const restartedCss = session.shell.locator("#domain-settings-css");
  await restartedCss.getByRole("button", { name: "Restore previous CSS" }).click();
  expect(await session.command("domain-css:get-state", { domain: "127.0.0.1" })).toEqual({
    domain: "127.0.0.1",
    enabled: false,
    hasFile: false,
  });
  await expect(restartedCss.getByRole("button", { name: "Open AI settings" })).toBeVisible();
  await session.capture("ai-disconnected-css");
});
