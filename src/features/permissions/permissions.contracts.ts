import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import {
  PERMISSIONS_GET_DOMAIN,
  PERMISSIONS_GET_GLOBAL,
  PERMISSIONS_RESET_GLOBAL,
  PERMISSIONS_REVOKE,
  PERMISSIONS_SET,
  PERMISSIONS_SET_GLOBAL,
} from "./permissions.shared";

export const PermissionDecisionSchema = z.union([z.literal("allow"), z.literal("deny")]);

export const PermissionsSetPayloadSchema = z.strictObject({
  domain: z.string().min(1),
  permission: z.string().min(1),
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

export const GlobalPermissionsSchema = z.strictObject({
  permissions: z.record(z.string(), PermissionDecisionSchema),
  availablePermissions: z.array(z.string()),
});

export const commandContracts = {
  [PERMISSIONS_GET_GLOBAL]: defineCommand(z.strictObject({}), GlobalPermissionsSchema, {
    description: "Read global permission choices and the permission catalog.",
    examples: [{}],
    sideEffects: [],
  }),
  [PERMISSIONS_SET_GLOBAL]: defineCommand(
    z.strictObject({ permission: z.string().min(1), decision: PermissionDecisionSchema }),
    z.undefined(),
    {
      description: "Apply a permission choice to every domain.",
      examples: [{ permission: "fullscreen", decision: "allow" }],
      sideEffects: ["Persists a global permission choice"],
    },
  ),
  [PERMISSIONS_RESET_GLOBAL]: defineCommand(
    z.strictObject({ permission: z.string().min(1) }),
    z.undefined(),
    {
      description: "Remove a global choice and restore per-domain permission behavior.",
      examples: [{ permission: "fullscreen" }],
      sideEffects: ["Deletes a global permission choice"],
    },
  ),
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
