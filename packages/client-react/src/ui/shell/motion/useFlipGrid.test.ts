import { describe, expect, it } from "vitest";

import { flipDeltas } from "./useFlipGrid";

describe("flipDeltas", () => {
  it("computes inverse deltas for moved items and skips unmoved ones", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0 }],
      ["GBPUSD", { left: 320, top: 0 }],
    ]);
    const next = new Map([
      ["EURUSD", { left: 320, top: 0 }],
      ["GBPUSD", { left: 320, top: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -320, dy: 0 },
    ]);
  });

  it("omits keys that only exist in one of the two maps", () => {
    const prev = new Map([["EURUSD", { left: 0, top: 0 }]]);
    const next = new Map([
      ["EURUSD", { left: 0, top: 0 }],
      ["GBPUSD", { left: 300, top: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });

  it("computes both axes when an item moves diagonally", () => {
    const prev = new Map([["EURUSD", { left: 0, top: 0 }]]);
    const next = new Map([["EURUSD", { left: 300, top: 120 }]]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -300, dy: -120 },
    ]);
  });

  it("returns an empty array when nothing moved", () => {
    const prev = new Map([["EURUSD", { left: 10, top: 10 }]]);
    const next = new Map([["EURUSD", { left: 10, top: 10 }]]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });
});
