import { describe, expect, it } from "vitest";

import { serializeValue } from "../serialize";

describe("serializeValue", () => {
  it("passes JSON primitives and plain shapes through", () => {
    expect(serializeValue(42)).toBe(42);
    expect(serializeValue("hi")).toBe("hi");
    expect(serializeValue(null)).toBe(null);
    expect(serializeValue({ a: [1, "x"] })).toEqual({ a: [1, "x"] });
  });

  it("tags non-JSON shapes", () => {
    expect(serializeValue(undefined)).toEqual({ $t: "undefined" });
    expect(serializeValue(() => {})).toMatchObject({ $t: "fn" });
    expect(serializeValue(Number.NaN)).toEqual({ $t: "num", v: "NaN" });
    expect(serializeValue(new Map([["k", 1]]))).toEqual({
      $t: "map",
      entries: [["k", 1]],
    });
    expect(serializeValue(new Set([1, 2]))).toEqual({
      $t: "set",
      values: [1, 2],
    });
  });

  it("caps depth at 6", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    const out = serializeValue(deep) as Record<string, never>;
    expect(JSON.stringify(out)).toContain('"$t":"depth"');
  });

  it("truncates arrays at 50 and strings at 500", () => {
    const arr = serializeValue(
      Array.from({ length: 60 }, (_, i) => {
        return i;
      }),
    );
    expect(Array.isArray(arr) && arr.length).toBe(51); // 50 + truncation marker
    expect((arr as unknown[])[50]).toEqual({ $t: "truncated", count: 10 });
    const s = serializeValue(
      "x".repeat(600),
    ) as unknown as TruncatedStringMatch;
    expect(s).toMatchObject({ $t: "truncated-string", count: 100 });
  });

  it("marks circular references instead of throwing", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(serializeValue(o)).toEqual({ self: { $t: "circular" } });
  });
});

interface TruncatedStringMatch {
  $t: string;
  count: number;
}
