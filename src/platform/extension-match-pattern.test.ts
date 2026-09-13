import { describe, expect, it } from "vitest";
import { matchesUrl } from "./extension-match-pattern";

describe("extension host permissions", () => {
  it("matches a domain and its subdomains without matching lookalikes or paths", () => {
    const pattern = "https://*.example.com/*";
    expect(matchesUrl(pattern, "https://example.com/login")).toBe(true);
    expect(matchesUrl(pattern, "https://vault.example.com/login")).toBe(true);
    expect(matchesUrl(pattern, "https://notexample.com/login")).toBe(false);
    expect(matchesUrl(pattern, "https://example.com.evil.test/login")).toBe(false);
    expect(matchesUrl(pattern, "https://evil.test/.example.com/login")).toBe(false);
    expect(matchesUrl(pattern, "https://example.com@evil.test/login")).toBe(false);
  });

  it("keeps scheme, path and internal-origin boundaries", () => {
    expect(matchesUrl("https://example.com/account/*", "http://example.com/account/login")).toBe(
      false,
    );
    expect(matchesUrl("https://example.com/account/*", "https://example.com/public")).toBe(false);
    expect(matchesUrl("*://example.com/*", "https://example.com:8443/login")).toBe(true);
    expect(
      matchesUrl("<all_urls>", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/popup.html"),
    ).toBe(false);
    expect(matchesUrl("<all_urls>", "file:///private")).toBe(false);
    expect(matchesUrl("<all_urls>", "invalid")).toBe(false);
  });
});
