/**
 * Generate typed FA icon names from @fortawesome/fontawesome-free metadata.
 * Run: bun scripts/generate-fa-icons.ts
 * Output: src/shared/fa-icons.generated.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const metaPath = resolve(
  root,
  "node_modules/@fortawesome/fontawesome-free/metadata/icon-families.json",
);
const outPath = resolve(root, "src/shared/fa-icons.generated.ts");

interface IconMeta {
  familyStylesByLicense: {
    free: Array<{ family: string; style: string }>;
  };
}

const icons: Record<string, IconMeta> = JSON.parse(readFileSync(metaPath, "utf-8"));

const solid: string[] = [];
const regular: string[] = [];
const brands: string[] = [];

for (const [name, meta] of Object.entries(icons)) {
  for (const entry of meta.familyStylesByLicense.free) {
    if (entry.family === "classic" && entry.style === "solid") solid.push(name);
    else if (entry.family === "classic" && entry.style === "regular") regular.push(name);
    else if (entry.family === "classic" && entry.style === "brands") brands.push(name);
  }
}

solid.sort();
regular.sort();
brands.sort();

function toUnion(names: string[]): string {
  return names.map((n) => `"${n}"`).join(" | ");
}

const output = `// Auto-generated — do not edit. Run: bun run generate:icons
export type FaSolidIcon = ${toUnion(solid)};
export type FaRegularIcon = ${toUnion(regular)};
export type FaBrandsIcon = ${toUnion(brands)};
export type FaIcon = FaSolidIcon | FaRegularIcon | FaBrandsIcon;
export type FaStyle = "solid" | "regular" | "brands";
/** Map from style to its valid icon names */
export type FaIconForStyle<S extends FaStyle> =
  S extends "solid" ? FaSolidIcon :
  S extends "regular" ? FaRegularIcon :
  S extends "brands" ? FaBrandsIcon : never;
`;

writeFileSync(outPath, output);
console.log(`Generated ${outPath}`);
console.log(`  solid: ${solid.length}, regular: ${regular.length}, brands: ${brands.length}`);
