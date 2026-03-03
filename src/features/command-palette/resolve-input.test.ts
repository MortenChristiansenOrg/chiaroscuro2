import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  DEFAULT_PROVIDERS,
  type ProviderConfig,
  resolveInput,
  resolveInputDetailed,
} from "./resolve-input";

describe("resolveInputDetailed", () => {
  it("empty input → type:empty", () => {
    expect(resolveInputDetailed("")).toEqual({ type: "empty" });
    expect(resolveInputDetailed("   ")).toEqual({ type: "empty" });
  });

  it("bang at start: !g query → Google search URL", () => {
    const result = resolveInputDetailed("!g hello world");
    expect(result).toEqual({
      type: "search",
      provider: "Google",
      query: "hello world",
      url: "https://www.google.com/search?q=hello%20world",
    });
  });

  it("bang at end: query !g → Google search URL", () => {
    const result = resolveInputDetailed("hello world !g");
    expect(result).toEqual({
      type: "search",
      provider: "Google",
      query: "hello world",
      url: "https://www.google.com/search?q=hello%20world",
    });
  });

  it("explicit https:// → type:url", () => {
    const result = resolveInputDetailed("https://example.com/path");
    expect(result).toEqual({ type: "url", url: "https://example.com/path" });
  });

  it("explicit http:// → type:url", () => {
    const result = resolveInputDetailed("http://localhost:3000");
    expect(result).toEqual({ type: "url", url: "http://localhost:3000" });
  });

  it("text with spaces → default provider search", () => {
    const result = resolveInputDetailed("hello world");
    expect(result).toMatchObject({
      type: "search",
      provider: "Google",
      query: "hello world",
    });
    expect((result as { url: string }).url).toContain("google.com");
  });

  it("localhost:3000 → http://localhost:3000", () => {
    const result = resolveInputDetailed("localhost:3000");
    expect(result).toEqual({ type: "url", url: "http://localhost:3000" });
  });

  it("localhost (no port) → http://localhost", () => {
    const result = resolveInputDetailed("localhost");
    expect(result).toEqual({ type: "url", url: "http://localhost" });
  });

  it("dotted hostname → https://domain", () => {
    const result = resolveInputDetailed("example.com");
    expect(result).toEqual({ type: "url", url: "https://example.com" });
  });

  it("/settings → built-in app:settings URL", () => {
    const result = resolveInputDetailed("/settings");
    expect(result).toEqual({ type: "url", url: "app:settings" });
  });

  it("single word → default search", () => {
    const result = resolveInputDetailed("hello");
    expect(result).toMatchObject({
      type: "search",
      provider: "Google",
      query: "hello",
    });
  });

  it("unknown bang → falls through to default search", () => {
    const result = resolveInputDetailed("!xyz query");
    // !xyz is not a known provider, but matches bang pattern — falls through
    // Since it has a space, it'll be a default search
    expect(result.type).toBe("search");
    expect((result as { provider: string }).provider).toBe("Google");
  });

  it("custom providers via config", () => {
    const config: ProviderConfig = {
      providers: [
        {
          id: "custom-1",
          bang: "!c",
          name: "Custom",
          urlTemplate: "https://custom.com/?q={query}",
        },
      ],
      defaultBang: "!c",
    };
    const result = resolveInputDetailed("!c test", config);
    expect(result).toMatchObject({ type: "search", provider: "Custom" });
  });

  it("custom default provider via config", () => {
    const config: ProviderConfig = {
      providers: DEFAULT_PROVIDERS,
      defaultBang: "!d",
    };
    const result = resolveInputDetailed("single word query", config);
    expect((result as { provider: string }).provider).toBe("DuckDuckGo");
  });

  it("uses DEFAULT_CONFIG when no config provided", () => {
    expect(DEFAULT_CONFIG.providers).toBe(DEFAULT_PROVIDERS);
    expect(DEFAULT_CONFIG.defaultBang).toBe("!g");
  });
});

describe("resolveInput (legacy)", () => {
  it("returns URL string for search", () => {
    const url = resolveInput("!g test");
    expect(url).toBe("https://www.google.com/search?q=test");
  });

  it("returns empty string for empty input", () => {
    expect(resolveInput("")).toBe("");
  });

  it("accepts config param", () => {
    const config: ProviderConfig = {
      providers: [
        {
          id: "custom-1",
          bang: "!c",
          name: "Custom",
          urlTemplate: "https://custom.com/?q={query}",
        },
      ],
      defaultBang: "!c",
    };
    expect(resolveInput("test", config)).toBe("https://custom.com/?q=test");
  });
});
