import { createHash } from "node:crypto";

/** Chromium crx_file::id_util hashes native path bytes (UTF-16LE on Windows).
 * See https://github.com/chromium/chromium/blob/main/components/crx_file/id_util.cc
 */
export function unpackedExtensionId(
  directory: string,
  key?: string,
  windows = process.platform === "win32",
): string {
  const normalized = windows
    ? directory.replace(/^[a-z]:/, (drive) => drive.toUpperCase())
    : directory;
  return createHash("sha256")
    .update(
      key ? Buffer.from(key, "base64") : Buffer.from(normalized, windows ? "utf16le" : "utf8"),
    )
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}
