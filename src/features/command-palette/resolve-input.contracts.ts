import { z } from "zod";

export const SearchProviderSchema = z.strictObject({
  id: z.string(),
  bang: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  urlTemplate: z.string(),
});
