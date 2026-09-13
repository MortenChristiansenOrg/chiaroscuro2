import { createHash, createPublicKey, createVerify } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fromBufferPromise } from "yauzl";
import { z } from "zod";

import { BITWARDEN_ID } from "./extensions.shared";

export { BITWARDEN_ID } from "./extensions.shared";

const MAX_PACKAGE = 100 * 1024 * 1024;
const MAX_EXPANDED = 300 * 1024 * 1024;
const publisherHash = "61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf";
const version = z
  .string()
  .regex(/^\d+(?:\.\d+){0,3}$/)
  .refine((value) => value.split(".").every((part) => Number(part) <= 65535));
export const manifestSchema = z
  .object({
    manifest_version: z.literal(3),
    name: z.string(),
    version,
    minimum_chrome_version: version.optional(),
    permissions: z.array(z.string()).default([]),
    host_permissions: z.array(z.string()).default([]),
    content_scripts: z
      .array(z.object({ matches: z.array(z.string()).default([]) }).passthrough())
      .default([]),
    key: z.string().optional(),
  })
  .passthrough();
export type ExtensionManifest = z.infer<typeof manifestSchema>;
export function compareVersions(a: string, b: string): number {
  const aa = a.split(".").map(Number),
    bb = b.split(".").map(Number);
  for (let i = 0; i < 4; i++) if ((aa[i] ?? 0) !== (bb[i] ?? 0)) return (aa[i] ?? 0) - (bb[i] ?? 0);
  return 0;
}
export function requiredPermissions(manifest: ExtensionManifest): string[] {
  return [
    ...new Set([
      ...manifest.permissions,
      ...manifest.host_permissions,
      ...manifest.content_scripts.flatMap((script) => script.matches),
    ]),
  ].sort();
}

/** Minimal bounded protobuf wire reader for CRX3's length-delimited proof fields. */
function fields(buffer: Buffer): Map<number, Buffer[]> {
  const result = new Map<number, Buffer[]>();
  let offset = 0;
  const integer = () => {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const byte = buffer[offset++];
      if (byte === undefined) throw new Error("Truncated CRX header");
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
    }
    throw new Error("Invalid CRX integer");
  };
  while (offset < buffer.length) {
    const tag = integer(),
      wire = tag % 8,
      number = Math.floor(tag / 8);
    if (!number) throw new Error("Invalid CRX field");
    if (wire === 0) {
      integer();
      continue;
    }
    const size = wire === 2 ? integer() : wire === 1 ? 8 : wire === 5 ? 4 : -1;
    if (size < 0 || offset + size > buffer.length) throw new Error("Invalid CRX field size");
    if (wire === 2)
      result.set(number, [...(result.get(number) ?? []), buffer.subarray(offset, offset + size)]);
    offset += size;
  }
  return result;
}
function one(data: Map<number, Buffer[]>, number: number): Buffer {
  const values = data.get(number);
  if (values?.length !== 1 || !values[0]) throw new Error("Missing or duplicate CRX proof field");
  return values[0];
}
export function idForKey(key: Buffer): string {
  return createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

/** Verify both developer identity and Google's store proof before reading archive contents.
 * Format: chromium/components/crx_file/crx3.proto and crx_verifier.cc (BSD).
 */
export function verifyCRX(buffer: Buffer, expectedId: string, requireStore = true): Buffer {
  if (
    buffer.length < 12 ||
    buffer.length > MAX_PACKAGE ||
    buffer.toString("ascii", 0, 4) !== "Cr24" ||
    buffer.readUInt32LE(4) !== 3
  )
    throw new Error("Invalid CRX3 package");
  const size = buffer.readUInt32LE(8);
  if (size > 1024 * 1024 || size + 12 >= buffer.length) throw new Error("Invalid CRX3 header size");
  const header = fields(buffer.subarray(12, 12 + size));
  const signed = one(header, 10000),
    declaredId = one(fields(signed), 1);
  const encodedId = declaredId
    .toString("hex")
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
  if (declaredId.length !== 16 || encodedId !== expectedId)
    throw new Error("Package does not match the requested extension");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signed.length);
  const archive = buffer.subarray(12 + size);
  let developer = false,
    publisher = false;
  for (const number of [2, 3])
    for (const proof of header.get(number) ?? []) {
      const parsed = fields(proof),
        key = one(parsed, 1),
        signature = one(parsed, 2);
      const publicKey = createPublicKey({ key, format: "der", type: "spki" });
      if (publicKey.asymmetricKeyType !== (number === 2 ? "rsa" : "ec"))
        throw new Error("Invalid CRX signing algorithm");
      const verifier = createVerify("sha256");
      verifier.update(Buffer.from("CRX3 SignedData\0"));
      verifier.update(length);
      verifier.update(signed);
      verifier.update(archive);
      if (!verifier.verify(publicKey, signature))
        throw new Error("Invalid extension package signature");
      developer ||= idForKey(key) === expectedId;
      publisher ||= createHash("sha256").update(key).digest("hex") === publisherHash;
    }
  if (!developer || (requireStore && !publisher))
    throw new Error("Missing trusted extension package signature");
  return archive;
}

export async function downloadPackage(
  id: string,
  chromeVersion: string,
  currentVersion?: string,
): Promise<Buffer | undefined> {
  if (id !== BITWARDEN_ID) throw new Error("Only Bitwarden is supported");
  const url = new URL("https://clients2.google.com/service/update2/crx");
  url.search = new URLSearchParams({
    response: "redirect",
    prodversion: chromeVersion,
    acceptformat: "crx3",
    x: `id=${id}&uc`,
  }).toString();
  if (currentVersion) {
    const check = new URL(url);
    check.searchParams.set("response", "updatecheck");
    check.searchParams.set("x", `id=${id}&v=${version.parse(currentVersion)}&uc`);
    const response = await fetch(check, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Update check failed (${response.status})`);
    const xml = (await readBounded(response, 64 * 1024)).toString("utf8");
    if (!xml.includes(`appid="${id}"`)) throw new Error("Invalid update service response");
    if (/<updatecheck\b[^>]*\bstatus="noupdate"/.test(xml)) return undefined;
    if (!/<updatecheck\b[^>]*\bstatus="ok"/.test(xml))
      throw new Error("Update service did not offer a compatible package");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body)
    throw new Error(`Extension download failed (${response.status})`);
  return readBounded(response, MAX_PACKAGE);
}

async function readBounded(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error("Empty update service response");
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Extension package is too large");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > limit) throw new Error("Extension package is too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Extract into a new private staging directory, never over live extension files. */
export async function extractPackage(
  archive: Buffer,
  directory: string,
): Promise<ExtensionManifest> {
  const zip = await fromBufferPromise(archive, {
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  let total = 0,
    count = 0;
  const names = new Set<string>();
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      const parts = name.replace(/\/$/, "").split("/");
      if (
        ++count > 20_000 ||
        parts.some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            /[<>:"\\|?*]/.test(part) ||
            [...part].some((character) => character.charCodeAt(0) < 32) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
      )
        throw new Error("Unsafe extension archive path");
      const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (mode !== 0 && mode !== 0x8000 && mode !== 0x4000)
        throw new Error("Extension archive contains a special file");
      if (names.has(name.toLowerCase())) throw new Error("Duplicate extension archive path");
      names.add(name.toLowerCase());
      total += entry.uncompressedSize;
      if (total > MAX_EXPANDED || entry.uncompressedSize > MAX_PACKAGE)
        throw new Error("Expanded extension package is too large");
      if (name.endsWith("/")) continue;
      const target = path.join(directory, ...parts);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await pipeline(
        await zip.openReadStreamPromise(entry),
        createWriteStream(target, { flags: "wx", mode: 0o600 }),
      );
    }
    const manifestPath = path.join(directory, "manifest.json");
    if ((await fs.stat(manifestPath)).size > 1024 * 1024)
      throw new Error("Extension manifest is too large");
    return manifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  } finally {
    zip.close();
  }
}
