/**
 * Build stamp: records which sources the build in out/ was made from, so the test session can
 * refuse to run scenarios against a stale build (see docs/testing/e2e-tests.md).
 *
 * `bun run build` snapshots the inputs before electron-vite runs (scripts/stamp-build.ts begin)
 * and writes out/build-stamp.json with input and output hashes once the build succeeds (commit).
 * The check compares both: changed sources mean the build is older than the code, and changed
 * outputs mean something else (such as `bun dev`) rewrote out/ after the build.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STAMP_FILE = "out/build-stamp.json";
export const PENDING_STAMP_FILE = "out/build-stamp.pending.json";
export const SKIP_BUILD_CHECK_ENV = "CHIAROSCURO_SKIP_BUILD_CHECK";

/** Files and directories electron-vite reads. Paths are relative to the project root. */
export const BUILD_INPUTS = [
  "src",
  "resources",
  "electron.vite.config.ts",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "tsconfig.node.json",
  "tsconfig.web.json",
  // Generates sources in src/shared before every build.
  "scripts/generate-fa-icons.ts",
];
export const BUILD_OUTPUTS = ["out/main", "out/preload", "out/renderer"];

const STAMP_VERSION = 1;

/** Relative path (always with forward slashes) to content hash. */
export type Fingerprint = Record<string, string>;

export interface BuildStamp {
  version: number;
  builtAt: string;
  inputs: Fingerprint;
  outputs: Fingerprint;
}

export interface FingerprintDiff {
  changed: string[];
  added: string[];
  removed: string[];
}

export type BuildCheck = { fresh: true } | { fresh: false; reason: string };

/** Unit tests never reach the bundle, so editing them must not make the build stale. */
function isBuildInput(relativePath: string): boolean {
  return !/\.test\.tsx?$/.test(relativePath) && !relativePath.startsWith("src/test-utils/");
}

function hashFile(file: string, normalizeLineEndings: boolean): string {
  let content = fs.readFileSync(file);
  // Windows checkouts may convert LF to CRLF in text files; the Linux CI build must still match
  // them. Like Git, treat a file with a NUL byte in its first 8000 bytes as binary.
  if (normalizeLineEndings && !content.subarray(0, 8000).includes(0))
    content = Buffer.from(content.toString("latin1").replaceAll("\r\n", "\n"), "latin1");
  return createHash("sha256").update(content).digest("hex");
}

function collect(root: string, entry: string, files: string[]): void {
  const absolute = path.join(root, entry);
  const stats = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!stats) return;
  if (stats.isFile()) {
    files.push(entry);
    return;
  }
  if (!stats.isDirectory()) return;
  for (const name of fs.readdirSync(absolute)) collect(root, `${entry}/${name}`, files);
}

export function fingerprint(
  root: string,
  entries: readonly string[],
  options: { normalizeLineEndings: boolean; include?: (relativePath: string) => boolean },
): Fingerprint {
  const files: string[] = [];
  for (const entry of entries) collect(root, entry, files);
  const result: Fingerprint = {};
  for (const file of files.sort()) {
    if (options.include && !options.include(file)) continue;
    result[file] = hashFile(path.join(root, file), options.normalizeLineEndings);
  }
  return result;
}

export function fingerprintInputs(root: string): Fingerprint {
  return fingerprint(root, BUILD_INPUTS, { normalizeLineEndings: true, include: isBuildInput });
}

export function fingerprintOutputs(root: string): Fingerprint {
  return fingerprint(root, BUILD_OUTPUTS, { normalizeLineEndings: false });
}

export function diffFingerprints(before: Fingerprint, after: Fingerprint): FingerprintDiff {
  const diff: FingerprintDiff = { changed: [], added: [], removed: [] };
  for (const [file, hash] of Object.entries(before)) {
    if (!(file in after)) diff.removed.push(file);
    else if (after[file] !== hash) diff.changed.push(file);
  }
  for (const file of Object.keys(after)) if (!(file in before)) diff.added.push(file);
  return diff;
}

function describeDiff(diff: FingerprintDiff, limit = 5): string {
  const items = [
    ...diff.changed.map((file) => `${file} changed`),
    ...diff.added.map((file) => `${file} added`),
    ...diff.removed.map((file) => `${file} removed`),
  ];
  const shown = items.slice(0, limit).join(", ");
  return items.length > limit ? `${shown} and ${items.length - limit} more` : shown;
}

function isEmpty(diff: FingerprintDiff): boolean {
  return diff.changed.length + diff.added.length + diff.removed.length === 0;
}

function readStamp(file: string): BuildStamp | null {
  try {
    const stamp = JSON.parse(fs.readFileSync(file, "utf8")) as BuildStamp;
    return stamp.version === STAMP_VERSION ? stamp : null;
  } catch {
    return null;
  }
}

/** Snapshot the inputs before building and drop the old stamp, so a failed build has none. */
export function beginBuildStamp(root: string): void {
  fs.mkdirSync(path.join(root, "out"), { recursive: true });
  fs.rmSync(path.join(root, STAMP_FILE), { force: true });
  fs.writeFileSync(
    path.join(root, PENDING_STAMP_FILE),
    JSON.stringify({ version: STAMP_VERSION, inputs: fingerprintInputs(root) }),
  );
}

/** After a successful build, record its outputs next to the inputs it was built from. */
export function commitBuildStamp(root: string, now = new Date()): void {
  const pendingFile = path.join(root, PENDING_STAMP_FILE);
  const pending = readStamp(pendingFile);
  if (!pending) throw new Error(`Missing ${PENDING_STAMP_FILE}; run stamp-build begin first.`);
  const stamp: BuildStamp = {
    version: STAMP_VERSION,
    builtAt: now.toISOString(),
    inputs: pending.inputs,
    outputs: fingerprintOutputs(root),
  };
  fs.writeFileSync(path.join(root, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
  fs.rmSync(pendingFile, { force: true });
}

export function checkBuild(root: string): BuildCheck {
  const stamp = readStamp(path.join(root, STAMP_FILE));
  if (!stamp)
    return {
      fresh: false,
      reason: `${STAMP_FILE} is missing, so out/ may not match the sources (it was built before build stamps existed, or the last build failed).`,
    };
  const inputs = diffFingerprints(stamp.inputs, fingerprintInputs(root));
  if (!isEmpty(inputs))
    return {
      fresh: false,
      reason: `The build in out/ (${stamp.builtAt}) is older than the sources: ${describeDiff(inputs)}.`,
    };
  const outputs = diffFingerprints(stamp.outputs, fingerprintOutputs(root));
  if (!isEmpty(outputs))
    return {
      fresh: false,
      reason: `out/ was modified after bun run build (for example by bun dev): ${describeDiff(outputs)}.`,
    };
  return { fresh: true };
}

/** Throws a message that tells how to rebuild unless out/ was built from the current sources. */
export function assertFreshBuild(root: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env[SKIP_BUILD_CHECK_ENV] === "1") return;
  const result = checkBuild(root);
  if (result.fresh) return;
  throw new Error(
    `Stale build: ${result.reason}\nRun bun run build and retry. To test this build anyway, set ${SKIP_BUILD_CHECK_ENV}=1.`,
  );
}
