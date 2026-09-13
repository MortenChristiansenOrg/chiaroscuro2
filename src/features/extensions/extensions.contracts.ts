import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  EXTENSIONS_APPROVE,
  EXTENSIONS_CHECK_UPDATES,
  EXTENSIONS_INSTALL,
  EXTENSIONS_OPEN,
  EXTENSIONS_OPEN_POPUP,
  EXTENSIONS_SET_ENABLED,
  EXTENSIONS_UNINSTALL,
} from "./extensions.shared";

const extensionId = z.string().regex(/^[a-p]{32}$/, "Invalid Chrome extension ID");
const exampleId = "nngceckbapebfimnlniiiahkandclblb";
const extensionPayload = z.strictObject({ extensionId });
export const commandContracts = {
  [EXTENSIONS_OPEN]: defineCommand(z.undefined(), z.undefined(), {
    description: "Open extension management.",
    sideEffects: ["Opens or activates extension management"],
    examples: [undefined],
  }),
  [EXTENSIONS_INSTALL]: defineCommand(
    extensionPayload.extend({ name: z.string() }),
    z.undefined(),
    {
      description: "Download official Bitwarden for permission review.",
      examples: [{ extensionId: exampleId, name: "Bitwarden" }],
      sideEffects: ["Downloads and stages authenticated extension code"],
    },
  ),
  [EXTENSIONS_CHECK_UPDATES]: defineCommand(extensionPayload, z.undefined(), {
    description: "Check for an official Bitwarden update.",
    examples: [{ extensionId: exampleId }],
    sideEffects: ["Downloads and stages an update for the next browser start"],
  }),
  [EXTENSIONS_APPROVE]: defineCommand(
    extensionPayload.extend({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
    z.undefined(),
    {
      description: "Approve reviewed installation or update permissions.",
      examples: [{ extensionId: exampleId, token: "a".repeat(64) }],
      sideEffects: [
        "Records permission approval",
        "Activates first installation or schedules update",
      ],
    },
  ),
  [EXTENSIONS_UNINSTALL]: defineCommand(extensionPayload, z.undefined(), {
    description: "Remove extension code, retaining local vault data for reinstall.",
    examples: [{ extensionId: exampleId }],
    sideEffects: ["Unloads extension and deletes installed and staged code"],
  }),
  [EXTENSIONS_SET_ENABLED]: defineCommand(
    extensionPayload.extend({ enabled: z.boolean() }),
    z.undefined(),
    {
      description: "Enable or disable an installed extension.",
      examples: [{ extensionId: exampleId, enabled: true }],
      sideEffects: ["Loads or unloads extension code"],
    },
  ),
  [EXTENSIONS_OPEN_POPUP]: defineCommand(extensionPayload, z.undefined(), {
    description: "Open the extension popup.",
    examples: [{ extensionId: exampleId }],
    sideEffects: ["Opens an extension popup window"],
  }),
};
