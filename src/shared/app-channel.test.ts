import { describe, expect, it } from "vitest";
import { APP_CHANNELS, releaseTag, runtimeChannel } from "./app-channel";

describe("release channels", () => {
  it.each([
    ["v0.0.0", "stable"],
    ["v1.2.3", "stable"],
    ["v1.2.3-beta.0", "early-access"],
    ["v1.2.3-beta.10", "early-access"],
  ])("classifies %s", (tag, channel) => {
    expect(releaseTag(tag).channel).toBe(channel);
  });
  it.each([
    "1.2.3",
    "v01.2.3",
    "v1.2.3-beta1",
    "v1.2.3-beta.01",
    "v1.2.3-rc.1",
    "v1.2.3+build",
    "v1.2.3\n",
    "v1.2.3;echo bad",
    "v1.2.3-beta.9007199254740992",
  ])("rejects %s", (tag) => {
    expect(() => releaseTag(tag)).toThrow();
  });
  it("keeps every OS identity, cache name and icon distinct", () => {
    for (const key of ["appId", "packageName", "productName", "icon"] as const) {
      expect(new Set(Object.values(APP_CHANNELS).map((channel) => channel[key])).size).toBe(3);
    }
  });
  it("uses Dev for unpackaged launches and automation regardless of package metadata", () => {
    expect(runtimeChannel(false, false, "stable")).toBe("dev");
    expect(runtimeChannel(true, true, "early-access")).toBe("dev");
    expect(runtimeChannel(true, false, "early-access")).toBe("early-access");
    expect(() => runtimeChannel(true, false, undefined)).toThrow();
    expect(() => runtimeChannel(true, false, "dev")).toThrow();
  });
});
