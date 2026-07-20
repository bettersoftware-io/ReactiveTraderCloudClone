import { describe, expect, it } from "vitest";

import { diffSerialized } from "../diff";
import type { SerializedValue } from "../serialize";

describe("diffSerialized", () => {
  it("returns [] for equal values", () => {
    const v: SerializedValue = { a: 1, b: [true, "x"] };

    expect(diffSerialized(v, structuredClone(v))).toEqual([]);
  });

  it("reports a changed nested leaf with its path", () => {
    expect(
      diffSerialized(
        { fx: { bid: 1.08, ask: 1.09 } },
        { fx: { bid: 1.07, ask: 1.09 } },
      ),
    ).toEqual([
      { path: ["fx", "bid"], kind: "changed", before: 1.08, after: 1.07 },
    ]);
  });

  it("reports added and removed keys", () => {
    const entries = diffSerialized({ a: 1, gone: 2 }, { a: 1, fresh: 3 });

    expect(entries).toContainEqual({
      path: ["gone"],
      kind: "removed",
      before: 2,
      after: null,
    });
    expect(entries).toContainEqual({
      path: ["fresh"],
      kind: "added",
      before: null,
      after: 3,
    });
    expect(entries).toHaveLength(2);
  });

  it("recurses arrays by index, including length changes", () => {
    const entries = diffSerialized([1, 2], [1, 5, 9]);

    expect(entries).toContainEqual({
      path: [1],
      kind: "changed",
      before: 2,
      after: 5,
    });
    expect(entries).toContainEqual({
      path: [2],
      kind: "added",
      before: null,
      after: 9,
    });
  });

  it("treats tagged nodes as leaves", () => {
    const prev: SerializedValue = { m: { $t: "map", entries: [["k", 1]] } };
    const next: SerializedValue = { m: { $t: "map", entries: [["k", 2]] } };

    expect(diffSerialized(prev, next)).toEqual([
      {
        path: ["m"],
        kind: "changed",
        before: { $t: "map", entries: [["k", 1]] },
        after: { $t: "map", entries: [["k", 2]] },
      },
    ]);
  });

  it("treats a type change as one changed leaf", () => {
    expect(diffSerialized({ a: [1] }, { a: "one" })).toEqual([
      { path: ["a"], kind: "changed", before: [1], after: "one" },
    ]);
  });
});
