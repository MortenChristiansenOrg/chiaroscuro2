import { z } from "zod";

export const SearchProviderSchema = z.strictObject({
  id: z.string(),
  bang: z
    .string()
    .describe(
      "Bang keyword such as !g. Empty or partial values are retained while editing; only complete !word keywords select a provider.",
    ),
  name: z.string(),
  icon: z.string().optional(),
  urlTemplate: z.string(),
});
