import { expect, it, vi } from "vitest";
import { earlyAccessFeed } from "./early-access-feed";

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
