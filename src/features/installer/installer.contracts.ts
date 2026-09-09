import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  INSTALLER_ALLOW_PROTOCOL,
  INSTALLER_APPLY_UPDATE,
  INSTALLER_CHECK_FOR_UPDATES,
  INSTALLER_DENY_PROTOCOL,
  INSTALLER_DISMISS_UPDATE,
} from "./installer.shared";

export const AllowProtocolPayloadSchema = z.strictObject({
  requestId: z.string(),
  always: z.boolean(),
});

export const DenyProtocolPayloadSchema = z.strictObject({ requestId: z.string() });

export const commandContracts = {
  [INSTALLER_CHECK_FOR_UPDATES]: defineCommand(z.undefined(), z.undefined(), {
    description: "Check the release server for an application update.",
    examples: [undefined],
    sideEffects: ["Contacts the release server"],
  }),
  [INSTALLER_APPLY_UPDATE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Install a downloaded update and restart.",
    examples: [undefined],
    sideEffects: ["Quits the application and runs the installer"],
  }),
  [INSTALLER_DISMISS_UPDATE]: defineCommand(z.undefined(), z.undefined(), {
    description: "Dismiss the update notification.",
    examples: [undefined],
    sideEffects: ["Changes notification visibility"],
  }),
  [INSTALLER_ALLOW_PROTOCOL]: defineCommand(AllowProtocolPayloadSchema, z.undefined(), {
    description: "Allow a requested external application protocol.",
    examples: [{ requestId: "example", always: false }],
    sideEffects: ["May launch an external application and persist the decision"],
  }),
  [INSTALLER_DENY_PROTOCOL]: defineCommand(DenyProtocolPayloadSchema, z.undefined(), {
    description: "Deny a requested external application protocol.",
    examples: [{ requestId: "example" }],
    sideEffects: ["Dismisses the request and may persist the decision"],
  }),
};
