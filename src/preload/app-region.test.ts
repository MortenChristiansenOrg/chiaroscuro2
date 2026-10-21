import { describe, expect, it, vi } from "vitest";

const { webFrame } = vi.hoisted(() => ({ webFrame: { insertCSS: vi.fn(() => "key") } }));
vi.mock("electron", () => ({ webFrame }));

import { disableAppRegions, NO_APP_REGION_CSS } from "./app-region";

describe("tab preload app-region", () => {
  it("inserts the override as a user-origin sheet", () => {
    disableAppRegions();
    expect(webFrame.insertCSS).toHaveBeenCalledWith(NO_APP_REGION_CSS, { cssOrigin: "user" });
  });

  it("resets every element and box pseudo-element, leaving one root rect", () => {
    const rules = NO_APP_REGION_CSS.split("\n");
    expect(rules[0]).toBe(":root { app-region: none !important; }");
    expect(
      rules.slice(1).every((rule) => rule.endsWith("{ app-region: initial !important; }")),
    ).toBe(true);
    // One rule per selector, so a pseudo-element Chromium lacks cannot void the others.
    expect(rules.every((rule) => !rule.includes(","))).toBe(true);
    expect(rules).toContain("::backdrop { app-region: initial !important; }");
  });
});
