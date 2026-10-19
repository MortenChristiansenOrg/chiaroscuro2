import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { earlyAccessFeed, hasCustomFeed } from "./early-access-feed";

const beta = (tag_name: string) => ({ tag_name, draft: false, prerelease: true });

it("selects highest beta numerically across pages and ignores stable, drafts and unsupported tags", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { ...beta("v9.0.0"), prerelease: false },
          beta("v3.0.0-rc.1"),
          { ...beta("v4.0.0-beta.1"), draft: true },
          beta("v1.2.3-beta.2"),
        ]),
        { headers: { Link: '<https://api.github.com/next>; rel="next"' } },
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify([beta("v1.2.3-beta.10")])));
  expect(await earlyAccessFeed(fetcher)).toBe(
    "https://github.com/MortenChristiansenOrg/chiaroscuro2/releases/download/v1.2.3-beta.10/",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("returns no update without beta releases", async () => {
  expect(await earlyAccessFeed(vi.fn(async () => new Response("[]")))).toBeNull();
});

it("fails closed on a rate limit", async () => {
  await expect(
    earlyAccessFeed(vi.fn(async () => new Response("", { status: 403 }))),
  ).rejects.toThrow("403");
});

it.each([
  ["owner: o\nrepo: r\nprovider: github\nchannel: beta\n", false],
  ["provider: generic\nurl: http://127.0.0.1:8080/\nchannel: beta\n", true],
  ["provider: 'generic'\nurl: http://127.0.0.1:8080/\n", true],
  ["channel: beta\n", false],
  [undefined, false],
])("detects a packaged feed other than GitHub in %j", async (config, custom) => {
  const resources = mkdtempSync(path.join(tmpdir(), "update-config-"));
  try {
    if (config !== undefined) writeFileSync(path.join(resources, "app-update.yml"), config);
    expect(await hasCustomFeed(resources)).toBe(custom);
  } finally {
    rmSync(resources, { recursive: true, force: true });
  }
});

it("treats an unpackaged process without resources as GitHub", async () => {
  expect(await hasCustomFeed(undefined)).toBe(false);
});
