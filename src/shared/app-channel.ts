/** Shared by packaging, release automation and Electron startup. */
export const APP_CHANNELS = {
  stable: {
    productName: "Chiaroscuro",
    packageName: "chiaroscuro",
    appId: "com.chiaroscuro.browser",
    icon: "icon",
    updateChannel: "latest",
  },
  "early-access": {
    productName: "Chiaroscuro Early Access",
    packageName: "chiaroscuro-early-access",
    appId: "com.chiaroscuro.browser.early-access",
    icon: "icon-early-access",
    updateChannel: "beta",
  },
  dev: {
    productName: "Chiaroscuro Dev",
    packageName: "chiaroscuro-dev",
    appId: "com.chiaroscuro.browser.dev",
    icon: "icon-dev",
    updateChannel: null,
  },
} as const;

export type AppChannel = keyof typeof APP_CHANNELS;
export type ReleaseChannel = Exclude<AppChannel, "dev">;
export const RELEASE_REPOSITORY = "MortenChristiansenOrg/chiaroscuro2";

// Restrict published versions to the two supported channels, including SemVer's
// prohibition on leading zeroes. Keep tag input out of shell source code.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

export function releaseVersion(version: string): { channel: ReleaseChannel; parts: number[] } {
  const match = VERSION.exec(version);
  if (!match) throw new Error(`Expected version like 1.2.3 or 1.2.3-beta.1: ${version}`);
  const parts = match
    .slice(1)
    .filter((part) => part !== undefined)
    .map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("Version component is too large");
  return { channel: match[4] === undefined ? "stable" : "early-access", parts };
}

export function releaseTag(tag: string) {
  if (!tag.startsWith("v")) throw new Error("Release tag must start with v");
  const version = tag.slice(1);
  return { tag, version, ...releaseVersion(version) };
}

export function isChannelVersion(channel: AppChannel, version: string): boolean {
  try {
    return releaseVersion(version).channel === channel;
  } catch {
    return false;
  }
}

export function runtimeChannel(
  isPackaged: boolean,
  isTest: boolean,
  metadata: unknown,
): AppChannel {
  if (isTest || !isPackaged) return "dev";
  if (metadata === "stable" || metadata === "early-access") return metadata;
  throw new Error("Packaged browser is missing a valid releaseChannel; use bun run package:win");
}
