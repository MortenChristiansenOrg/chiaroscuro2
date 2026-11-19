import { z } from "zod";
import { NavigationBlockRuleSchema } from "../domain-css/domain-css.contracts";
import {
  applyDomainCustomization,
  type DomainCustomization,
  getDomainCustomization,
  listDomainCustomizations,
} from "../domain-css/domain-css.main";
import { DomainScriptSchema } from "../domain-scripts/domain-scripts.contracts";
import { applySyncedScript, listScriptsForSync } from "../domain-scripts/domain-scripts.main";
import type { DomainScript } from "../domain-scripts/domain-scripts.shared";
import { normalizeDomain } from "../domain-scripts/matching";
import type { JsonValue } from "./app-data-client.main";
import { jsonEqual } from "./merge.main";
import { LocalChangedError, type SyncSource } from "./sync-engine.main";

/**
 * Documents carry a schema version so a later browser version can change their shape. A
 * newer version than this browser knows is reported instead of being misread or overwritten.
 */
const SCHEMA_VERSION = 1;

function checkVersion(value: JsonValue) {
  const version =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value.schemaVersion
      : undefined;
  if (typeof version === "number" && version > SCHEMA_VERSION)
    throw new Error(
      "Another machine saved this with a newer version of Chiaroscuro. Update this machine to sync it.",
    );
}

function invalid(error: z.ZodError): Error {
  const first = error.issues[0];
  return new Error(
    `The version from another machine isn't valid: ${first?.path.join(".") || "value"} ${first?.message ?? ""}`.trim(),
  );
}

// Same shape as the service's own Chiaroscuro adapter (client/chiaroscuro.ts), so agents
// and other tools using it read the same documents.
const DomainRecordSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  domain: z.string(),
  css: z.string().nullable(),
  enabled: z.boolean(),
  navigation: z.strictObject({
    blockNavigate: NavigationBlockRuleSchema,
    blockRedirect: NavigationBlockRuleSchema,
    blockFrameNavigate: NavigationBlockRuleSchema,
    blockNewTabs: z.boolean(),
    blockNewWindows: z.boolean(),
  }),
});
type DomainRecord = z.infer<typeof DomainRecordSchema>;

function domainRecord(domain: string, value: DomainCustomization | null): JsonValue | null {
  return value && { schemaVersion: SCHEMA_VERSION, domain, ...value };
}

function isHostname(domain: string): boolean {
  try {
    return normalizeDomain(domain) === domain;
  } catch {
    return false;
  }
}

export const domainCustomizationSource: SyncSource = {
  namespace: "domains",
  describe: (domain) => `${domain} styles and navigation rules`,
  read() {
    const result = new Map<string, JsonValue>();
    for (const [domain, value] of listDomainCustomizations()) {
      // Only hostnames sync; anything else would be refused by every machine's `parse`.
      if (isHostname(domain)) result.set(domain, domainRecord(domain, value) as JsonValue);
    }
    return result;
  },
  parse(key, value) {
    checkVersion(value);
    const parsed = DomainRecordSchema.safeParse(value);
    if (!parsed.success) throw invalid(parsed.error);
    let domain: string;
    try {
      domain = normalizeDomain(key);
    } catch {
      throw new Error(`${key} isn't a domain this browser can customize.`);
    }
    if (domain !== key || parsed.data.domain !== key)
      throw new Error(`The version from another machine is for ${parsed.data.domain}, not ${key}.`);
    return parsed.data as JsonValue;
  },
  async apply(domain, value, expected) {
    if (!jsonEqual(domainRecord(domain, getDomainCustomization(domain)), expected))
      throw new LocalChangedError();
    const record = value as DomainRecord | null;
    await applyDomainCustomization(
      domain,
      record && { css: record.css, enabled: record.enabled, navigation: record.navigation },
    );
  },
};

const ScriptRecordSchema = DomainScriptSchema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  // Defaults would hide a field missing from another machine's version.
  pathPattern: z.string().max(1000),
  alias: z.string().trim().max(100),
  shortcut: z.string().trim().max(100),
});

function scriptRecord(script: DomainScript | null): JsonValue | null {
  return script && { schemaVersion: SCHEMA_VERSION, ...script };
}

export const domainScriptSource: SyncSource = {
  namespace: "scripts",
  describe(id, value) {
    const script = value as Partial<DomainScript> | null;
    return script?.name && script.domain
      ? `Script “${script.name}” on ${script.domain}`
      : `Website script ${id}`;
  },
  read() {
    return new Map(
      listScriptsForSync().map((script) => [script.id, scriptRecord(script) as JsonValue]),
    );
  },
  parse(id, value) {
    checkVersion(value);
    const parsed = ScriptRecordSchema.safeParse(value);
    if (!parsed.success) throw invalid(parsed.error);
    if (parsed.data.id !== id)
      throw new Error(`The version from another machine belongs to script ${parsed.data.id}.`);
    return parsed.data as JsonValue;
  },
  async apply(id, value, expected) {
    let script: DomainScript | null = null;
    if (value) {
      const { schemaVersion: _, ...rest } = value as DomainScript & { schemaVersion: number };
      script = rest;
    }
    const applied = await applySyncedScript(id, script, (current) =>
      jsonEqual(scriptRecord(current), expected),
    );
    if (!applied) throw new LocalChangedError();
  },
};
