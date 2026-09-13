import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  DOMAIN_CSS_EDIT,
  DOMAIN_CSS_GET_STATE,
  DOMAIN_CSS_REMOVE,
  DOMAIN_CSS_TOGGLE,
  DOMAIN_NAVIGATION_GET_STATE,
  DOMAIN_NAVIGATION_SET,
  DOMAIN_SETTINGS_OPEN,
} from "./domain-css.shared";

export const DomainSettingsOpenPayloadSchema = z.strictObject({ domain: z.string() });

export const DomainCssTogglePayloadSchema = z.strictObject({ domain: z.string() });

export const DomainCssEditPayloadSchema = z.strictObject({ domain: z.string() });

export const DomainCssRemovePayloadSchema = z.strictObject({ domain: z.string() });

export const DomainCssGetStatePayloadSchema = z.strictObject({ domain: z.string() });

export const DomainCssStateSchema = z.strictObject({
  domain: z.string(),
  enabled: z.boolean(),
  hasFile: z.boolean(),
});

export const NavigationBlockRuleSchema = z.strictObject({
  enabled: z.boolean(),
  crossOriginOnly: z.boolean(),
});

export const DomainNavigationSetPayloadSchema = z.strictObject({
  domain: z.string(),
  blockNavigate: NavigationBlockRuleSchema,
  blockRedirect: NavigationBlockRuleSchema,
  blockFrameNavigate: NavigationBlockRuleSchema,
  blockNewTabs: z.boolean(),
  blockNewWindows: z.boolean(),
});

export const DomainNavigationGetStatePayloadSchema = z.strictObject({ domain: z.string() });

export const DomainNavigationStateSchema = z.strictObject({
  domain: z.string(),
  blockNavigate: NavigationBlockRuleSchema,
  blockRedirect: NavigationBlockRuleSchema,
  blockFrameNavigate: NavigationBlockRuleSchema,
  blockNewTabs: z.boolean(),
  blockNewWindows: z.boolean(),
});

export const commandContracts = {
  [DOMAIN_SETTINGS_OPEN]: defineCommand(DomainSettingsOpenPayloadSchema, TabIdSchema, {
    description: "Open the settings page for a domain.",
    examples: [{ domain: "example.com" }],
    sideEffects: ["Creates or activates a settings tab"],
  }),
  [DOMAIN_CSS_TOGGLE]: defineCommand(DomainCssTogglePayloadSchema, z.undefined(), {
    description: "Toggle custom CSS for a domain.",
    examples: [{ domain: "example.com" }],
    sideEffects: ["Writes settings and changes page styling"],
  }),
  [DOMAIN_CSS_EDIT]: defineCommand(DomainCssEditPayloadSchema, z.undefined(), {
    description: "Open the domain stylesheet in the external editor.",
    examples: [{ domain: "example.com" }],
    sideEffects: ["Creates a stylesheet if missing and launches an external editor"],
  }),
  [DOMAIN_CSS_REMOVE]: defineCommand(DomainCssRemovePayloadSchema, z.undefined(), {
    description: "Remove a domain stylesheet.",
    examples: [{ domain: "example.com" }],
    sideEffects: ["Deletes the stylesheet and updates page styling"],
  }),
  [DOMAIN_CSS_GET_STATE]: defineCommand(DomainCssGetStatePayloadSchema, DomainCssStateSchema, {
    description: "Read the domain stylesheet status.",
    examples: [{ domain: "example.com" }],
    sideEffects: [],
  }),
  [DOMAIN_NAVIGATION_SET]: defineCommand(DomainNavigationSetPayloadSchema, z.undefined(), {
    description: "Configure navigation and popup blocking for a domain.",
    examples: [
      {
        domain: "example.com",
        blockNavigate: { enabled: false, crossOriginOnly: false },
        blockRedirect: { enabled: false, crossOriginOnly: false },
        blockFrameNavigate: { enabled: false, crossOriginOnly: false },
        blockNewTabs: false,
        blockNewWindows: false,
      },
    ],
    sideEffects: ["Persists navigation restrictions"],
  }),
  [DOMAIN_NAVIGATION_GET_STATE]: defineCommand(
    DomainNavigationGetStatePayloadSchema,
    DomainNavigationStateSchema,
    {
      description: "Read navigation restrictions for a domain.",
      examples: [{ domain: "example.com" }],
      sideEffects: [],
    },
  ),
};
