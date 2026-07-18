import { describe, expect, it } from "vitest";

import { flipDeltas } from "./flip.js";

describe("flipDeltas", () => {
  it("computes inverse deltas for moved items and skips unmoved ones", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0, width: 0, height: 0 }],
      ["GBPUSD", { left: 320, top: 0, width: 0, height: 0 }],
    ]);

    const next = new Map([
      ["EURUSD", { left: 320, top: 0, width: 0, height: 0 }],
      ["GBPUSD", { left: 320, top: 0, width: 0, height: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -320, dy: 0 },
    ]);
  });

  it("omits keys that only exist in one of the two maps", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0, width: 0, height: 0 }],
    ]);

    const next = new Map([
      ["EURUSD", { left: 0, top: 0, width: 0, height: 0 }],
      ["GBPUSD", { left: 300, top: 0, width: 0, height: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });

  it("computes both axes when an item moves diagonally", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0, width: 0, height: 0 }],
    ]);

    const next = new Map([
      ["EURUSD", { left: 300, top: 120, width: 0, height: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -300, dy: -120 },
    ]);
  });

  it("returns an empty array when nothing moved", () => {
    const prev = new Map([
      ["EURUSD", { left: 10, top: 10, width: 0, height: 0 }],
    ]);

    const next = new Map([
      ["EURUSD", { left: 10, top: 10, width: 0, height: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });

  // PROTO useFlip.ts parity: sub-pixel nudges (< 0.5px on both axes) don't
  // glide — a re-render that barely moves a node shouldn't flicker.
  it("suppresses sub-pixel deltas on both axes", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0, width: 0, height: 0 }],
    ]);

    const next = new Map([
      ["EURUSD", { left: 0.3, top: -0.4, width: 0, height: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([]);
  });

  it("keeps a delta when either axis moved at least half a pixel", () => {
    const prev = new Map([
      ["EURUSD", { left: 0, top: 0, width: 0, height: 0 }],
    ]);

    const next = new Map([
      ["EURUSD", { left: 0.2, top: 12, width: 0, height: 0 }],
    ]);
    expect(flipDeltas(prev, next)).toEqual([
      { key: "EURUSD", dx: -0.2, dy: -12 },
    ]);
  });
});
