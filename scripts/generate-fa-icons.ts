/**
 * Generate typed FA icon names from @fortawesome/fontawesome-free metadata.
 * Run: bun scripts/generate-fa-icons.ts
 * Output: src/shared/fa-icons.generated.ts, src/shared/fa-icon-search.generated.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const metaPath = resolve(
  root,
  "node_modules/@fortawesome/fontawesome-free/metadata/icon-families.json",
);
const outPath = resolve(root, "src/shared/fa-icons.generated.ts");
const searchOutPath = resolve(root, "src/shared/fa-icon-search.generated.ts");

interface IconMeta {
  familyStylesByLicense: {
    free: Array<{ family: string; style: string }>;
  };
  search?: { terms: string[] };
  label?: string;
}

const icons: Record<string, IconMeta> = JSON.parse(readFileSync(metaPath, "utf-8"));

const solid: string[] = [];
const regular: string[] = [];
const brands: string[] = [];
const solidSearch: Array<{ name: string; text: string }> = [];

for (const [name, meta] of Object.entries(icons)) {
  for (const entry of meta.familyStylesByLicense.free) {
    if (entry.family === "classic" && entry.style === "solid") {
      solid.push(name);
      // Build combined search text: icon name + label + search terms
      const terms = [name, ...(meta.search?.terms ?? [])];
      if (meta.label && meta.label !== name) terms.push(meta.label);
      solidSearch.push({ name, text: terms.join(" ") });
    } else if (entry.family === "classic" && entry.style === "regular") regular.push(name);
    else if (entry.family === "classic" && entry.style === "brands") brands.push(name);
  }
}

solid.sort();
regular.sort();
brands.sort();
solidSearch.sort((a, b) => a.name.localeCompare(b.name));

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

// Generate search index: [iconName, combinedSearchText][]
const searchEntries = solidSearch.map(
  (e) => `[${JSON.stringify(e.name)},${JSON.stringify(e.text)}]`,
);
const searchOutput = `// Auto-generated — do not edit. Run: bun run generate:icons
/** [iconName, combinedSearchText] tuples for solid icons. */
export const FA_SOLID_SEARCH: Array<[string, string]> = [
${searchEntries.join(",\n")}
];
`;

writeFileSync(outPath, output);
writeFileSync(searchOutPath, searchOutput);
console.log(`Generated ${outPath}`);
console.log(`Generated ${searchOutPath}`);
console.log(`  solid: ${solid.length}, regular: ${regular.length}, brands: ${brands.length}`);
