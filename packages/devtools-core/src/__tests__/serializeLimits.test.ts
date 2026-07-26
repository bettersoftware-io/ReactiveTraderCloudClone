import { describe, expect, it } from "vitest";

import { serializeValue } from "../serialize";

// The truncation limits and exotic-type branches are what stop the inspector
// serialising an unbounded live state tree into the transport. When one breaks
// the failure is quiet: either a 50k-entry Map is shipped whole, or a value
// silently becomes `undefined` on the panel side. MAX_ENTRIES is 50.

const OVER_LIMIT = 60;

describe("serializeValue — collection limits", () => {
  it("truncates a Map past the entry cap and reports how many were dropped", () => {
    const map = new Map(
      Array.from({ length: OVER_LIMIT }, (_, i) => {
        return [`k${i}`, i] as const;
      }),
    );

    const out = serializeValue(map) as unknown as SerializedEntries;

    // 50 kept + one truncation marker.
    expect(out.entries).toHaveLength(51);
    expect(out.entries.at(-1)).toEqual({ $t: "truncated", count: 10 });
  });

  it("truncates a Set past the entry cap", () => {
    const set = new Set(
      Array.from({ length: OVER_LIMIT }, (_, i) => {
        return i;
      }),
    );

    const out = serializeValue(set) as unknown as SerializedValues;

    expect(out.values).toHaveLength(51);
    expect(out.values.at(-1)).toEqual({ $t: "truncated", count: 10 });
  });

  it("records a marker when an object has more keys than the cap", () => {
    const wide: Record<string, number> = {};

    for (let i = 0; i < OVER_LIMIT; i++) {
      wide[`k${i}`] = i;
    }

    const out = serializeValue(wide) as SerializedWideObject;

    expect(out.$truncatedKeys).toEqual({ $t: "truncated", count: 10 });
  });
});

describe("serializeValue — exotic types", () => {
  it("tags a bigint by value rather than dropping it", () => {
    expect(serializeValue(90071992547409911n)).toEqual({
      $t: "bigint",
      v: "90071992547409911",
    });
  });

  it("tags a symbol by description", () => {
    expect(serializeValue(Symbol("tile"))).toMatchObject({ $t: "symbol" });
  });

  it("passes booleans through untagged", () => {
    expect(serializeValue(true)).toBe(true);
    expect(serializeValue(false)).toBe(false);
  });
});

describe("serializeValue — hostile input", () => {
  it("returns an error envelope instead of throwing when a getter blows up", () => {
    const hostile = {
      get boom(): never {
        throw new Error("getter exploded");
      },
    };

    const out = serializeValue(hostile) as SerializedError;

    // The inspector must survive instrumenting a value it cannot read — a throw
    // here would propagate into the app's own state pipeline.
    expect(out.$t).toBe("error");
    expect(out.message).toContain("getter exploded");
  });
});

interface SerializedEntries {
  entries: unknown[];
}

interface SerializedValues {
  values: unknown[];
}

interface TruncationMarker {
  count: number;
}

interface SerializedWideObject {
  $truncatedKeys?: TruncationMarker;
}

interface SerializedError {
  $t?: string;
  message?: string;
}
