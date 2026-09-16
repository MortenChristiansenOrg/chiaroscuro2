import fs from "node:fs";
import path from "node:path";

/** Remove only the bootstrap prepended by the original extension experiment. */
export function stripLegacyExtensionBootstrap(source: string): string {
  if (!source.startsWith("/* chiaroscuro-api-stubs */\n")) return source;
  const end = source.indexOf("\n})();\n");
  if (end < 0) throw new Error("Unrecognized legacy extension patch; reinstall the extension");
  return source.slice(end + "\n})();\n".length);
}

export function migrateExtensionBootstrap(directory: string): void {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  const worker = manifest.background?.service_worker;
  if (typeof worker !== "string") return;
  const file = path.resolve(directory, worker);
  const relative = path.relative(directory, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Extension background script must be inside its directory");
  }
  const realRelative = path.relative(fs.realpathSync(directory), fs.realpathSync(file));
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error("Extension background script must be inside its directory");
  }
  const original = fs.readFileSync(file, "utf8");
  const migrated = stripLegacyExtensionBootstrap(original);
  if (migrated !== original) fs.writeFileSync(file, migrated);
}
