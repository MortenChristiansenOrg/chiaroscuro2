import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { SearchProviderSchema } from "../command-palette/resolve-input.contracts";
import { SETTINGS_GET, SETTINGS_OPEN, SETTINGS_SAVE } from "./settings.shared";

export const DebugServerSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  port: z.number().int().min(0).max(65535),
});

export const SettingsSchema = z.strictObject({
  searchProviders: z.array(SearchProviderSchema),
  defaultSearchProviderId: z.string(),
  debugServer: DebugServerSettingsSchema,
});

export const commandContracts = {
  [SETTINGS_OPEN]: defineCommand(z.undefined(), z.undefined(), {
    description: "Open browser settings.",
    examples: [undefined],
    sideEffects: ["Creates or activates a settings tab"],
  }),
  [SETTINGS_GET]: defineCommand(z.undefined(), SettingsSchema, {
    description: "Read browser settings.",
    examples: [undefined],
    sideEffects: [],
  }),
  [SETTINGS_SAVE]: defineCommand(SettingsSchema, z.undefined(), {
    description: "Replace browser settings with the supplied configuration.",
    examples: [
      {
        searchProviders: [
          {
            id: "example-id",
            bang: "!g",
            name: "Google",
            urlTemplate: "https://www.google.com/search?q={query}",
          },
        ],
        defaultSearchProviderId: "!g",
        debugServer: { enabled: false, port: 9222 },
      },
    ],
    sideEffects: ["Persists settings and reconfigures affected features"],
  }),
};
