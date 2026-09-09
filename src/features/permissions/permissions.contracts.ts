import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { PERMISSIONS_GET_DOMAIN, PERMISSIONS_REVOKE, PERMISSIONS_SET } from "./permissions.shared";

export const PermissionDecisionSchema = z.union([z.literal("allow"), z.literal("deny")]);

export const PermissionsSetPayloadSchema = z.strictObject({
  domain: z.string(),
  permission: z.string(),
  decision: PermissionDecisionSchema,
});

export const PermissionsRevokePayloadSchema = z.strictObject({
  domain: z.string(),
  permission: z.string(),
});

export const PermissionsGetDomainPayloadSchema = z.strictObject({ domain: z.string() });

export const DomainPermissionsSchema = z.strictObject({
  domain: z.string(),
  permissions: z.record(z.string(), PermissionDecisionSchema),
});

export const commandContracts = {
  [PERMISSIONS_SET]: defineCommand(PermissionsSetPayloadSchema, z.undefined(), {
    description: "Set an allow or deny decision for a domain permission.",
    examples: [{ domain: "example.com", permission: "notifications", decision: "allow" }],
    sideEffects: ["Persists a permission decision"],
  }),
  [PERMISSIONS_REVOKE]: defineCommand(PermissionsRevokePayloadSchema, z.undefined(), {
    description: "Remove a domain permission decision.",
    examples: [{ domain: "example.com", permission: "notifications" }],
    sideEffects: ["Deletes a persisted permission decision"],
  }),
  [PERMISSIONS_GET_DOMAIN]: defineCommand(
    PermissionsGetDomainPayloadSchema,
    DomainPermissionsSchema,
    {
      description: "Read saved permission decisions for a domain.",
      examples: [{ domain: "example.com" }],
      sideEffects: [],
    },
  ),
};
