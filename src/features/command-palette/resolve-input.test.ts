import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDERS,
  getProviders,
  resolveInput,
  resolveInputDetailed,
  setDefaultProvider,
  setProviders,
} from "./resolve-input";

describe("resolveInputDetailed", () => {
  afterEach(() => {
    // Reset to defaults
    setProviders(DEFAULT_PROVIDERS);
    setDefaultProvider("!d");
  });

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
      provider: "DuckDuckGo",
      query: "hello world",
    });
    expect((result as { url: string }).url).toContain("duckduckgo.com");
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

  it("single word → default search", () => {
    const result = resolveInputDetailed("hello");
    expect(result).toMatchObject({
      type: "search",
      provider: "DuckDuckGo",
      query: "hello",
    });
  });

  it("unknown bang → falls through to default search", () => {
    const result = resolveInputDetailed("!xyz query");
    // !xyz is not a known provider, but matches bang pattern — falls through
    // Since it has a space, it'll be a default search
    expect(result.type).toBe("search");
    expect((result as { provider: string }).provider).toBe("DuckDuckGo");
  });

  it("setProviders replaces providers", () => {
    setProviders([{ bang: "!c", name: "Custom", urlTemplate: "https://custom.com/?q={query}" }]);
    const result = resolveInputDetailed("!c test");
    expect(result).toMatchObject({ type: "search", provider: "Custom" });

    expect(getProviders()).toHaveLength(1);
  });

  it("setDefaultProvider changes default", () => {
    setDefaultProvider("!g");
    const result = resolveInputDetailed("single word query");
    expect((result as { provider: string }).provider).toBe("Google");
  });
});

describe("resolveInput (legacy)", () => {
  afterEach(() => {
    setProviders(DEFAULT_PROVIDERS);
    setDefaultProvider("!d");
  });

  it("returns URL string for search", () => {
    const url = resolveInput("!g test");
    expect(url).toBe("https://www.google.com/search?q=test");
  });

  it("returns empty string for empty input", () => {
    expect(resolveInput("")).toBe("");
  });
});
