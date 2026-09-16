import { describe, expect, it } from "vitest";
import { stripLegacyExtensionBootstrap } from "./extension-migration";

describe("legacy extension migration", () => {
  it("removes the old stubs while retaining the original extension code exactly", () => {
    const original = "/* vendor license */\n(function(){ console.log('worker'); })();\n";
    const patched = `/* chiaroscuro-api-stubs */\n(function(){\nchrome.offscreen = {};\n})();\n${original}`;
    expect(stripLegacyExtensionBootstrap(patched)).toBe(original);
    expect(stripLegacyExtensionBootstrap(original)).toBe(original);
  });

  it("does not guess where an unrecognized patch ends", () => {
    expect(() => stripLegacyExtensionBootstrap("/* chiaroscuro-api-stubs */\nunknown")).toThrow(
      "reinstall",
    );
  });
});
