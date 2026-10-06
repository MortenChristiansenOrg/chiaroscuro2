import { z } from "zod";
import { MODEL_DEFAULT_EFFORT } from "./ai.shared";

// Fallbacks apply only to models returned by the account's live catalog.
// https://developers.openai.com/api/docs/models/gpt-5.6-sol
// https://developers.openai.com/api/docs/models/gpt-6-sol
const documentedEfforts: Record<string, string[]> = {
  "gpt-5.6-sol": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-5.6-terra": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-5.6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-6-sol": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-6-astra": ["low", "medium", "high", "xhigh", "max"],
  "gpt-6.1-sol": ["low", "medium", "high", "xhigh", "max"],
};
const visibleModelSchema = z.object({
  slug: z.string().min(1),
  display_name: z.string().min(1),
  supported_reasoning_efforts: z
    .array(z.union([z.string().min(1), z.object({ reasoning_effort: z.string().min(1) })]))
    .nullish(),
});
const catalogSchema = z.object({
  models: z.array(z.object({ visibility: z.string() }).passthrough()),
});

export function parseModelCatalog(body: unknown) {
  const catalog = catalogSchema.safeParse(body);
  if (!catalog.success)
    throw new Error("ChatGPT returned an unexpected model catalog. Refresh models to retry.");
  return catalog.data.models
    .filter((model) => model.visibility === "list")
    .map((entry) => {
      const parsed = visibleModelSchema.safeParse(entry);
      if (!parsed.success)
        throw new Error("ChatGPT returned an unexpected model catalog. Refresh models to retry.");
      const model = parsed.data;
      const efforts =
        model.supported_reasoning_efforts?.map((effort) =>
          typeof effort === "string" ? effort : effort.reasoning_effort,
        ) ??
        (Object.hasOwn(documentedEfforts, model.slug) ? documentedEfforts[model.slug] : undefined);
      return {
        slug: model.slug,
        name: model.display_name,
        efforts: efforts?.length ? [...efforts] : [MODEL_DEFAULT_EFFORT],
      };
    });
}
