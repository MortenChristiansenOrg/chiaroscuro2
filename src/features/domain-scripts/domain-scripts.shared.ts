import type { z } from "zod";
import type { CommandTypes } from "../../bus/contract";
import type { TabId } from "../../shared/types";
import type {
  commandContracts,
  DomainScriptActionSchema,
  DomainScriptSchema,
} from "./domain-scripts.contracts";

export const DOMAIN_SCRIPTS_LIST = "domain-scripts:list" as const;
export const DOMAIN_SCRIPTS_SAVE = "domain-scripts:save" as const;
export const DOMAIN_SCRIPTS_REMOVE = "domain-scripts:remove" as const;
export const DOMAIN_SCRIPTS_RUN = "domain-scripts:run" as const;
export const DOMAIN_SCRIPTS_RUN_ALIAS = "domain-scripts:run-alias" as const;
export const DOMAIN_SCRIPTS_ACTIONS = "domain-scripts:actions" as const;
export const DOMAIN_SCRIPTS_CHANGED = "domain-scripts:changed" as const;
export const DOMAIN_SCRIPTS_EXECUTED = "domain-scripts:executed" as const;

export type DomainScript = z.infer<typeof DomainScriptSchema>;
export type DomainScriptAction = z.infer<typeof DomainScriptActionSchema>;
export interface DomainScriptsChangedEvent {
  domain: string;
  scripts: DomainScript[];
}
export interface DomainScriptsExecutedEvent {
  id: string;
  domain: string;
  tabId: TabId;
  status: "succeeded" | "failed";
  error?: string;
}
export type DomainScriptsCommands = CommandTypes<typeof commandContracts>;
export type DomainScriptsEvents = {
  [DOMAIN_SCRIPTS_CHANGED]: DomainScriptsChangedEvent;
  [DOMAIN_SCRIPTS_EXECUTED]: DomainScriptsExecutedEvent;
};
