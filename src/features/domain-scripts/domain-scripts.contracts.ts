import { z } from "zod";
import { defineCommand } from "../../bus/contract";
import { TabIdSchema } from "../../shared/types.contracts";
import {
  DOMAIN_SCRIPTS_ACTIONS,
  DOMAIN_SCRIPTS_LIST,
  DOMAIN_SCRIPTS_REMOVE,
  DOMAIN_SCRIPTS_RUN,
  DOMAIN_SCRIPTS_RUN_ALIAS,
  DOMAIN_SCRIPTS_SAVE,
} from "./domain-scripts.shared";

export const DomainScriptSchema = z.strictObject({
  id: z.string().min(1).max(128),
  domain: z.string().min(1).max(253),
  name: z.string().trim().min(1).max(120),
  source: z.string().min(1).max(100_000),
  enabled: z.boolean(),
  runAt: z.enum(["manual", "page-load"]),
  pathPattern: z.string().max(1000).default("/*"),
  alias: z.string().trim().max(100).default(""),
  shortcut: z.string().trim().max(100).default(""),
});
export const DomainScriptActionSchema = DomainScriptSchema.pick({
  id: true,
  name: true,
  alias: true,
  shortcut: true,
});

export const commandContracts = {
  [DOMAIN_SCRIPTS_LIST]: defineCommand(
    z.strictObject({ domain: z.string().optional() }),
    z.array(DomainScriptSchema),
    {
      description: "List locally saved website scripts, optionally for one domain.",
      examples: [{ domain: "example.com" }],
      sideEffects: [],
    },
  ),
  [DOMAIN_SCRIPTS_SAVE]: defineCommand(
    z.strictObject({ script: DomainScriptSchema }),
    DomainScriptSchema,
    {
      description: "Create or update a named website script.",
      examples: [
        {
          script: {
            id: "copy-title",
            domain: "example.com",
            name: "Copy title",
            source: "await copy(document.title);",
            enabled: true,
            runAt: "manual",
            pathPattern: "/*",
            alias: "/copy-title",
            shortcut: "",
          },
        },
      ],
      sideEffects: ["Persists scripts and updates local keyboard shortcuts"],
    },
  ),
  [DOMAIN_SCRIPTS_REMOVE]: defineCommand(z.strictObject({ id: z.string() }), z.undefined(), {
    description: "Remove a website script.",
    examples: [{ id: "script-example" }],
    sideEffects: ["Persists scripts and removes the shortcut"],
  }),
  [DOMAIN_SCRIPTS_RUN]: defineCommand(
    z.strictObject({ id: z.string(), tabId: TabIdSchema.optional() }),
    z.undefined(),
    {
      description: "Run a manual website script on the selected matching page.",
      examples: [{ id: "script-example" }],
      sideEffects: ["Executes user JavaScript and may write the clipboard"],
    },
  ),
  [DOMAIN_SCRIPTS_RUN_ALIAS]: defineCommand(
    z.strictObject({ alias: z.string() }),
    z.strictObject({ handled: z.boolean() }),
    {
      description: "Run a matching manual script alias on the selected page.",
      examples: [{ alias: "/copy-issue" }],
      sideEffects: ["May execute user JavaScript and write the clipboard"],
    },
  ),
  [DOMAIN_SCRIPTS_ACTIONS]: defineCommand(
    z.strictObject({ query: z.string().optional() }),
    z.array(DomainScriptActionSchema),
    {
      description: "List matching manual website actions for the selected page.",
      examples: [{ query: "copy" }],
      sideEffects: [],
    },
  ),
};
