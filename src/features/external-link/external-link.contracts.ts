import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { EXTERNAL_LINK_OPEN, EXTERNAL_LINK_PROTOCOL_PATTERN } from "./external-link.shared";

export const ExternalLinkOpenPayloadSchema = z.strictObject({
  url: z
    .url()
    .regex(EXTERNAL_LINK_PROTOCOL_PATTERN, "Only http, https, and file URLs are supported"),
});

export const commandContracts = {
  [EXTERNAL_LINK_OPEN]: defineCommand(ExternalLinkOpenPayloadSchema, z.undefined(), {
    description: "Open an external URL in the browser.",
    examples: [{ url: "https://example.com/" }],
    sideEffects: ["Creates or activates a tab"],
  }),
};
