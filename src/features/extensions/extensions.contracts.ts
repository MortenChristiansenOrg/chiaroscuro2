import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  EXTENSIONS_INSTALL,
  EXTENSIONS_OPEN,
  EXTENSIONS_OPEN_POPUP,
  EXTENSIONS_SEARCH,
  EXTENSIONS_SET_ENABLED,
  EXTENSIONS_UNINSTALL,
} from "./extensions.shared";

const extensionId = z.string().regex(/^[a-p]{32}$/, "Invalid Chrome extension ID");
const exampleId = "nngceckbapebfimnlniiiahkandclblb";
const extensionPayload = z.strictObject({ extensionId });

export const commandContracts = {
  [EXTENSIONS_OPEN]: defineCommand(z.undefined(), z.undefined(), {
    description: "Open the extensions management page.",
    examples: [undefined],
    sideEffects: ["Opens or activates the extensions tab"],
  }),
  [EXTENSIONS_SEARCH]: defineCommand(
    z.strictObject({ query: z.string() }),
    z.array(
      z.strictObject({
        id: extensionId,
        name: z.string(),
        description: z.string(),
        iconUrl: z.string(),
        featured: z.boolean(),
        rating: z.number().nullable(),
        ratingCount: z.number().nullable(),
        userCount: z.number().nullable(),
      }),
    ),
    {
      description: "Search the Chrome Web Store.",
      examples: [{ query: "Bitwarden" }],
      sideEffects: ["Requests search results from the Chrome Web Store"],
    },
  ),
  [EXTENSIONS_INSTALL]: defineCommand(
    extensionPayload.extend({ name: z.string() }),
    z.undefined(),
    {
      description: "Download and install a Chrome extension.",
      examples: [{ extensionId: exampleId, name: "Bitwarden" }],
      sideEffects: ["Downloads, writes and loads extension code", "Saves installed extensions"],
    },
  ),
  [EXTENSIONS_UNINSTALL]: defineCommand(extensionPayload, z.undefined(), {
    description: "Uninstall an extension.",
    examples: [{ extensionId: exampleId }],
    sideEffects: ["Unloads and deletes extension code", "Saves installed extensions"],
  }),
  [EXTENSIONS_SET_ENABLED]: defineCommand(
    extensionPayload.extend({ enabled: z.boolean() }),
    z.undefined(),
    {
      description: "Enable or disable an installed extension.",
      examples: [{ extensionId: exampleId, enabled: true }],
      sideEffects: ["Loads or unloads extension code", "Saves installed extensions"],
    },
  ),
  [EXTENSIONS_OPEN_POPUP]: defineCommand(extensionPayload, z.undefined(), {
    description: "Open an extension's toolbar popup.",
    examples: [{ extensionId: exampleId }],
    sideEffects: ["Opens an extension popup window"],
  }),
};
