import { describe, expect, it, vi } from "vitest";

const { webFrame } = vi.hoisted(() => ({ webFrame: { insertCSS: vi.fn(() => "key") } }));
vi.mock("electron", () => ({ webFrame }));

import { disableAppRegions, NO_APP_REGION_CSS } from "./app-region";

describe("tab preload app-region", () => {
  it("overrides every page app-region with a user-origin important rule", () => {
    disableAppRegions();
    expect(webFrame.insertCSS).toHaveBeenCalledWith(NO_APP_REGION_CSS, { cssOrigin: "user" });
    expect(NO_APP_REGION_CSS).toMatch(/app-region:\s*none\s*!important/);
  });
});
