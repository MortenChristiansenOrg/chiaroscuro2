import { describe, expect, it } from "vitest";
import { isAllowedNavigation, isAllowedUrl } from "./url-policy";

describe("local file navigation", () => {
  it.each([
    "file:///home/user/pages/index.html",
    "file:///C:/pages/index.html",
    "file://wsl.localhost/Ubuntu/home/user/pages/index.html",
    "file://wsl$/Ubuntu/home/user/pages/index.html",
  ])("allows relative links from %s", (source) => {
    expect(isAllowedNavigation(new URL("other%20page.html#section", source).href, source)).toBe(
      true,
    );
  });

  it.each(["https://example.com/", "http://localhost/", "data:text/html,hello", "about:blank", ""])(
    "blocks local files from %s",
    (source) => {
      expect(isAllowedNavigation("file://wsl.localhost/Ubuntu/home/user/other.html", source)).toBe(
        false,
      );
    },
  );

  it("retains the internal-only scheme boundary", () => {
    expect(isAllowedUrl("file:///tmp/index.html", "internal")).toBe(true);
    expect(isAllowedUrl("file:///tmp/index.html")).toBe(false);
    expect(isAllowedNavigation("chrome-extension://id/page.html", "file:///tmp/index.html")).toBe(
      false,
    );
    expect(isAllowedNavigation("javascript:alert(1)", "file:///tmp/index.html")).toBe(false);
    expect(isAllowedNavigation("invalid", "file:///tmp/index.html")).toBe(false);
    expect(isAllowedNavigation("https://example.com", "file:///tmp/index.html")).toBe(true);
  });
});
