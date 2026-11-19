import { describe, expect, it } from "vitest";
import { jsonEqual, merge3 } from "./merge.main";

describe("jsonEqual", () => {
  it("ignores property order and compares nested values", () => {
    expect(jsonEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });
});

describe("merge3", () => {
  const base = {
    css: "a",
    enabled: false,
    navigation: { blockNewTabs: false, blockNewWindows: false },
  };

  it("combines changes to different properties, including nested ones", () => {
    const local = { ...base, css: "b", navigation: { ...base.navigation, blockNewTabs: true } };
    const remote = {
      ...base,
      enabled: true,
      navigation: { ...base.navigation, blockNewWindows: true },
    };
    expect(merge3(base, local, remote)).toEqual({
      merged: true,
      value: { css: "b", enabled: true, navigation: { blockNewTabs: true, blockNewWindows: true } },
    });
  });

  it("reports a conflict when both sides change the same property differently", () => {
    expect(merge3(base, { ...base, css: "b" }, { ...base, css: "c" })).toEqual({ merged: false });
  });

  it("accepts the same change made on both sides", () => {
    expect(merge3(base, { ...base, css: "b" }, { ...base, css: "b" })).toEqual({
      merged: true,
      value: { ...base, css: "b" },
    });
  });

  it("merges independently created objects that only differ where one side added", () => {
    expect(merge3(undefined, { a: 1, b: 2 }, { a: 1, c: 3 })).toEqual({
      merged: true,
      value: { a: 1, b: 2, c: 3 },
    });
    expect(merge3(undefined, { a: 1 }, { a: 2 })).toEqual({ merged: false });
  });

  it("treats property names like constructor and __proto__ as plain data", () => {
    const local = JSON.parse('{"a":1,"constructor":2}');
    const remote = JSON.parse('{"a":1,"__proto__":{"x":1}}');
    const result = merge3(undefined, local, remote);
    expect(result.merged).toBe(true);
    expect(JSON.parse(JSON.stringify(result.merged && result.value))).toEqual(
      JSON.parse('{"a":1,"constructor":2,"__proto__":{"x":1}}'),
    );
    expect(jsonEqual({ a: 1 }, JSON.parse('{"a":1,"constructor":2}'))).toBe(false);
  });

  it("drops a property one side removed and the other left alone", () => {
    expect(merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 })).toEqual({
      merged: true,
      value: { a: 1, c: 3 },
    });
  });
});
