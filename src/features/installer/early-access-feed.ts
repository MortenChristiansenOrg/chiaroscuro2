import { RELEASE_REPOSITORY, releaseTag } from "../../shared/app-channel";

interface Release {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
}

/** GitHub's built-in beta provider may select stable releases. Select a beta
 * explicitly, then let electron-updater handle its manifest/download/install. */
export async function earlyAccessFeed(fetcher: typeof fetch = fetch): Promise<string | null> {
  let newest: { tag: string; parts: number[] } | undefined;
  // Bound requests in case GitHub returns a malformed/repeating pagination link.
  for (let page = 1; page <= 10; page++) {
    const response = await fetcher(
      `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=100&page=${page}`,
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error(`Early Access release lookup failed (${response.status})`);
    const releases = (await response.json()) as Release[];
    if (!Array.isArray(releases)) throw new Error("Invalid GitHub releases response");
    for (const release of releases) {
      if (release.draft !== false || release.prerelease !== true) continue;
      try {
        const candidate = releaseTag(release.tag_name);
        if (candidate.channel !== "early-access") continue;
        const difference = candidate.parts.findIndex((part, i) => part !== newest?.parts[i]);
        if (
          !newest ||
          (difference >= 0 && (candidate.parts[difference] ?? 0) > (newest.parts[difference] ?? 0))
        ) {
          newest = candidate;
        }
      } catch {
        // Ignore unrelated tags, including unsupported alpha/RC versions.
      }
    }
    if (!response.headers.get("link")?.includes('rel="next"')) {
      return newest
        ? `https://github.com/${RELEASE_REPOSITORY}/releases/download/${newest.tag}/`
        : null;
    }
  }
  throw new Error("Early Access release lookup exceeded the pagination limit");
}
