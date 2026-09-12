import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { releaseConfig } from "../../scripts/release-config";

it("packages beta with a separate installer, cache, profile identity and manifest", () => {
  const stable = releaseConfig("v1.2.3");
  const beta = releaseConfig("v1.2.4-beta.10");
  expect(stable.appId).toBe("com.chiaroscuro.browser");
  expect(stable.extraMetadata?.name).toBe("chiaroscuro");
  expect(beta.appId).not.toBe(stable.appId);
  expect(beta.extraMetadata).toEqual({
    name: "chiaroscuro-early-access",
    version: "1.2.4-beta.10",
    releaseChannel: "early-access",
  });
  expect(beta.publish).toMatchObject({ channel: "beta" });
  expect(stable.publish).toMatchObject({ channel: "latest" });
  expect(beta.generateUpdatesFilesForAllChannels).toBe(false);
  expect(beta.nsis?.allowToChangeInstallationDirectory).toBe(false);
  expect(beta.nsis?.artifactName).toBe(`Chiaroscuro-Early-Access-Setup-\${version}.\${ext}`);
});

it("ships multiresolution ICO variants including the small Windows taskbar sizes", () => {
  for (const icon of ["icon-early-access", "icon-dev"]) {
    const bytes = readFileSync(`resources/${icon}.ico`);
    expect(bytes.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: bytes.readUInt16LE(4) }, (_, i) => bytes[6 + i * 16] || 256);
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  }
});
