import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareVersions, extractPackage, idForKey, verifyCRX } from "./extension-package";
import { archive } from "./extension-test-utils";

function integer(n: number): Buffer {
  const bytes = [];
  do {
    bytes.push((n & 127) | (n > 127 ? 128 : 0));
    n = Math.floor(n / 128);
  } while (n);
  return Buffer.from(bytes);
}
function field(n: number, value: Buffer) {
  return Buffer.concat([integer(n * 8 + 2), integer(value.length), value]);
}
function signedPackage(zip: Buffer) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = publicKey.export({ type: "spki", format: "der" });
  const signed = field(1, createHash("sha256").update(key).digest().subarray(0, 16));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signed.length);
  const signature = sign(
    "sha256",
    Buffer.concat([Buffer.from("CRX3 SignedData\0"), length, signed, zip]),
    privateKey,
  );
  const header = Buffer.concat([
    field(2, Buffer.concat([field(1, key), field(2, signature)])),
    field(10000, signed),
  ]);
  const prefix = Buffer.alloc(12);
  prefix.write("Cr24");
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return { bytes: Buffer.concat([prefix, header, zip]), id: idForKey(key) };
}
describe("extension package trust and extraction", () => {
  it("authenticates developer signatures and requires a store proof in production", () => {
    const zip = archive({ "manifest.json": "{}" }),
      pkg = signedPackage(zip);
    expect(verifyCRX(pkg.bytes, pkg.id, false)).toEqual(zip);
    expect(() => verifyCRX(pkg.bytes, pkg.id)).toThrow("trusted");
    expect(() => verifyCRX(pkg.bytes, "a".repeat(32), false)).toThrow("requested");
    const corrupt = Buffer.from(pkg.bytes);
    corrupt[corrupt.length - 1] = 1;
    expect(() => verifyCRX(corrupt, pkg.id, false)).toThrow("signature");
    expect(() => verifyCRX(pkg.bytes.subarray(0, 15), pkg.id)).toThrow();
  });
  it("rejects traversal, duplicate case aliases and Windows device paths before writing them", async () => {
    for (const files of [
      { "../escape": "bad" },
      { "CON.txt": "bad" },
      { "a.txt": "one", "A.txt": "two" },
      { "a:b": "bad" },
    ]) {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "extension-zip-"));
      try {
        await expect(extractPackage(archive(files), dir)).rejects.toThrow();
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });
  it("extracts ordinary vendor files and compares version components numerically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "extension-zip-"));
    try {
      const manifest = await extractPackage(
        archive({
          "manifest.json": JSON.stringify({
            manifest_version: 3,
            name: "Fixture",
            version: "2026.10.0",
          }),
          "popup/index.html": "hello",
        }),
        dir,
      );
      expect(manifest.version).toBe("2026.10.0");
      expect(await fs.readFile(path.join(dir, "popup/index.html"), "utf8")).toBe("hello");
      expect(compareVersions("2026.10.0", "2026.8.0")).toBeGreaterThan(0);
      expect(compareVersions("1.0", "1.0.0.0")).toBe(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
