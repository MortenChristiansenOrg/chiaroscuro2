import { expect, it } from "vitest";
import { parseModelCatalog } from "./model-catalog.main";

const listed = (slug: string, extra = {}) => ({
  slug,
  display_name: slug,
  visibility: "list",
  ...extra,
});
it("makes every model in the reported catalog usable without inventing missing models", () => {
  const slugs = ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
  const models = parseModelCatalog({ models: slugs.map((slug) => listed(slug)) });
  expect(models.map((model) => model.slug)).toEqual(slugs);
  for (const model of models) expect(model.efforts).toContain("high");
  for (const model of models.slice(1))
    expect(model.efforts).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
});
it("includes GPT-6 Sol and Luna when listed, preserves server order, and excludes hidden models", () => {
  const models = parseModelCatalog({
    models: [listed("gpt-6-sol"), { visibility: "hidden" }, listed("gpt-6-luna")],
  });
  expect(models.map((model) => model.slug)).toEqual(["gpt-6-sol", "gpt-6-luna"]);
  expect(models.every((model) => model.efforts.includes("high"))).toBe(true);
});
it("prefers catalog reasoning metadata, including object entries, over documented fallbacks", () => {
  expect(
    parseModelCatalog({
      models: [
        listed("gpt-5.6-sol", {
          display_name: "Account model name",
          supported_reasoning_efforts: ["low", { reasoning_effort: "high" }],
        }),
      ],
    }),
  ).toEqual([{ slug: "gpt-5.6-sol", name: "Account model name", efforts: ["low", "high"] }]);
});
it("uses model defaults for new models or explicitly empty options without guessing effort values", () => {
  const models = parseModelCatalog({
    models: [
      listed("future-model"),
      listed("toString"),
      listed("gpt-6-sol", { supported_reasoning_efforts: [] }),
    ],
  });
  expect(models.map((model) => model.efforts)).toEqual([["default"], ["default"], ["default"]]);
});
it.each([
  {},
  { models: null },
  { models: [listed("")] },
  {
    models: [listed("future-model", { supported_reasoning_efforts: [{}] })],
  },
])("rejects malformed catalogs with recovery guidance", (body) => {
  expect(() => parseModelCatalog(body)).toThrow("Refresh models to retry");
});
