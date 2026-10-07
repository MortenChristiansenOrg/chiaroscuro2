import type { AiProvider } from "../../src/features/ai/chatgpt-client.main";
import { parseModelCatalog } from "../../src/features/ai/model-catalog.main";
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

test("AI model picker uses live account choices and supports missing reasoning metadata", async ({
  appSession: session,
}) => {
  test.setTimeout(120000);
  await VerificationPage.navigate(session, `${site.url}/scripts/initial`);
  await session.command("settings:open", undefined);
  const listed = (slug: string, display_name: string) => ({
    slug,
    display_name,
    visibility: "list",
  });
  const reported = parseModelCatalog({
    models: [
      listed("gpt-6-astra", "GPT-6 Astra"),
      listed("gpt-5.6-sol", "GPT-5.6 Sol"),
      listed("gpt-5.6-terra", "GPT-5.6 Terra"),
      listed("gpt-5.6-luna", "GPT-5.6 Luna"),
    ],
  });
  const refreshed = parseModelCatalog({
    models: [
      listed("gpt-6-sol", "GPT-6 Sol"),
      listed("gpt-6-luna", "GPT-6 Luna"),
      listed("future-model", "Future model"),
      { visibility: "hidden" },
    ],
  });
  await session.app.evaluate(
    (_, catalogs) => {
      const provider = (globalThis as unknown as { __testHooks: { aiProvider: AiProvider } })
        .__testHooks.aiProvider;
      let connected = false;
      let reads = 0;
      provider.status = () => ({ connected, sharing: connected, account: "fixture@example.com" });
      provider.connect = async () => {
        connected = true;
      };
      provider.models = async () => (reads++ === 0 ? catalogs.reported : catalogs.refreshed);
      provider.respond = async (options) => {
        if (options.model !== "future-model" || options.effort !== "default")
          throw new Error("The request did not use the selected model default");
        return "await copy(document.title);";
      };
    },
    { reported, refreshed },
  );
  const ai = session.shell.locator("#settings-ai");
  await ai.getByRole("button", { name: "Continue with ChatGPT" }).click();
  const model = ai.getByRole("combobox", { name: "AI model" });
  const effort = ai.getByRole("combobox", { name: "AI reasoning effort" });
  await expect(model.locator('option[value="gpt-5.6-sol"]')).toBeEnabled();
  await expect(model.locator('option[value="gpt-6-sol"]')).toHaveCount(0);
  for (const slug of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    await model.selectOption(slug);
    await expect(model).toHaveValue(slug);
    await expect(effort).toHaveValue("high");
  }
  await ai.scrollIntoViewIfNeeded();
  await session.capture("ai-model-picker-reported-catalog");
  await ai.getByRole("button", { name: "Refresh models" }).click();
  await expect(model.locator('option[value="gpt-6-sol"]')).toBeEnabled();
  for (const slug of ["gpt-6-sol", "gpt-6-luna"]) {
    await model.selectOption(slug);
    await expect(model).toHaveValue(slug);
    await expect(effort).toHaveValue("high");
  }
  await session.capture("ai-model-picker-refreshed-catalog");
  await model.selectOption("future-model");
  await expect(effort).toHaveValue("default");
  await expect(effort.locator("option")).toHaveText(["Model default"]);
  await expect(
    ai.getByText("Reasoning options are not provided for this model. Requests use its default."),
  ).toBeVisible();
  await session.capture("ai-model-picker-model-default");
  await session.command("domain-settings:open", { domain: "127.0.0.1" });
  const scripts = session.shell.locator("#domain-settings-scripts");
  await scripts.getByRole("button", { name: "Add script", exact: true }).click();
  const form = scripts.getByRole("form", { name: "New script", exact: true });
  await form.getByRole("textbox", { name: "Describe the change" }).fill("Copy the page title");
  await form.getByRole("button", { name: "Generate draft" }).click();
  await expect(form.getByRole("textbox", { name: "JavaScript", exact: true })).toHaveValue(
    "await copy(document.title);",
  );
  await session.restart();
  expect(await session.command("ai:get-state", {})).toMatchObject({
    selection: { model: "future-model", effort: "default" },
  });
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
  await session.app.evaluate(({ BrowserWindow, nativeImage }) => {
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
      const pink = "h1 { color: rgb(180, 30, 70) !important; }";
      if (options.instructions.startsWith("Write the complete")) {
        // Background/occluded pages can stop receiving animation frames while
        // inference runs. Hide the owned window to reproduce that native state.
        BrowserWindow.getAllWindows()
          .find((win) => !win.getParentWindow())
          ?.hide();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return JSON.stringify(options.input).includes("font larger")
          ? `${pink} h1 { font-size: 56px !important; }`
          : "h1 { color: blue !important; }";
      }
      const images = options.input.flatMap((item) =>
        typeof item.content === "string"
          ? []
          : item.content.filter((part) => part.type === "input_image"),
      );
      if (images.length < 2) throw new Error("Missing actual before/after screenshots");
      const latestCss = options.input
        .filter(
          (item) =>
            item.role === "assistant" &&
            typeof item.content === "string" &&
            item.content.startsWith("h1"),
        )
        .at(-1)?.content as string;
      const achieved = latestCss.includes("180, 30, 70");
      const image = images.at(-1);
      if (image?.type !== "input_image") throw new Error("Missing assessed image");
      const bitmap = nativeImage.createFromDataURL(image.image_url).toBitmap();
      const [blue, green, red] = achieved ? [70, 30, 180] : [255, 0, 0];
      let painted = false;
      for (let offset = 0; offset < bitmap.length; offset += 4) {
        if (bitmap[offset] === blue && bitmap[offset + 1] === green && bitmap[offset + 2] === red) {
          painted = true;
          break;
        }
      }
      if (!painted) throw new Error("The assessed screenshot does not show the preview CSS");
      BrowserWindow.getAllWindows()
        .find((win) => !win.getParentWindow())
        ?.show();
      return JSON.stringify({
        achieved,
        explanation: achieved
          ? "The heading is pink as requested."
          : "The heading is blue. Correcting it to pink.",
        revisedCss: achieved ? null : pink,
      });
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
  await expect(css.getByRole("status")).toContainText("CSS saved.", { timeout: 20000 });
  await expect(css.getByRole("button", { name: "Restore previous CSS" })).toBeVisible();
  const target = await session.target((target) => target.url === url && target.kind === "tab");
  await session.shell.locator(`[data-tab-id="${target.tabId}"]`).click();
  const page = await session.page(target);
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");
  await session.capture("ai-css-applied");
  await new WindowChromePage(session.shell).reloadButton.click();
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");

  // A follow-up starts from the saved CSS, preserves the color, and changes size.
  await session.command("domain-settings:open", { domain: "127.0.0.1" });
  await css.getByRole("button", { name: "Enabled", exact: true }).click();
  await expect(page.locator("h1")).not.toHaveCSS("color", "rgb(180, 30, 70)");
  await css.getByRole("button", { name: "Disabled", exact: true }).click();
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");
  await cssRequest.fill("Keep the pink color and make the font larger");
  await css.getByRole("button", { name: "Generate and verify CSS" }).click();
  await expect(css.getByRole("status")).toContainText("CSS saved.", { timeout: 20000 });
  await css.scrollIntoViewIfNeeded();
  await session.capture("ai-css-result");
  await session.shell.locator(`[data-tab-id="${target.tabId}"]`).click();
  await expect(page.locator("h1")).toHaveCSS("font-size", "56px");
  await expect(page.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");
  await session.capture("ai-css-refined");
  const childId = await session.command<string>("sub-tabs:open", {
    parentTabId: target.tabId,
    url: `${site.url}/child`,
  });
  const child = await session.target((item) => item.tabId === childId && item.kind === "sub-tab");
  await expect((await session.page(child)).locator("h1")).toHaveCSS("font-size", "56px");
  await session.command("sub-tabs:close", { parentTabId: target.tabId });

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
    enabled: true,
    hasFile: true,
  });
  const restoredTarget = await session.target((item) => item.url === url && item.kind === "tab");
  await session.shell.locator(`[data-tab-id="${restoredTarget.tabId}"]`).click();
  const restoredPage = await session.page(restoredTarget);
  await expect(restoredPage.locator("h1")).toHaveCSS("color", "rgb(180, 30, 70)");
  await expect(restoredPage.locator("h1")).not.toHaveCSS("font-size", "56px");
  await session.command("domain-settings:open", { domain: "127.0.0.1" });
  await expect(restartedCss.getByRole("button", { name: "Open AI settings" })).toBeVisible();
  await session.capture("ai-disconnected-css");
});
