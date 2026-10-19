/**
 * Writes out/build-stamp.json around electron-vite build; see scripts/build-stamp.ts.
 * Run: bun scripts/stamp-build.ts begin|commit|check
 */

import { assertFreshBuild, beginBuildStamp, commitBuildStamp } from "./build-stamp";

const root = process.cwd();
const command = process.argv[2];
if (command === "begin") beginBuildStamp(root);
else if (command === "commit") commitBuildStamp(root);
else if (command === "check") {
  try {
    assertFreshBuild(root);
    console.log("out/ matches the sources.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  console.error("Usage: bun scripts/stamp-build.ts begin|commit|check");
  process.exitCode = 1;
}
