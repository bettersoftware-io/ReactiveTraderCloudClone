import { describe, expect, test } from "vitest";

import { sortMovers, sparklinePoints } from "./moversVm";

const ROWS = [
  { symbol: "AAPL", name: "Apple Inc", last: 227.17, changePct: -1.06 },
  { symbol: "TSLA", name: "Tesla Inc", last: 248.67, changePct: 1.13 },
  { symbol: "NVDA", name: "NVIDIA Corp", last: 131.05, changePct: 0.21 },
];

describe("sortMovers", () => {
  test("chg sorts by change% descending — the design's default board order", () => {
    expect(
      sortMovers(ROWS, "chg").map((r) => {
        return r.symbol;
      }),
    ).toEqual(["TSLA", "NVDA", "AAPL"]);
  });

  test("price sorts by last descending", () => {
    expect(
      sortMovers(ROWS, "price").map((r) => {
        return r.symbol;
      }),
    ).toEqual(["TSLA", "AAPL", "NVDA"]);
  });

  test("sym sorts A-Z ascending", () => {
    expect(
      sortMovers(ROWS, "sym").map((r) => {
        return r.symbol;
      }),
    ).toEqual(["AAPL", "NVDA", "TSLA"]);
  });

  test("does not mutate its input", () => {
    const before = ROWS.map((r) => {
      return r.symbol;
    });

    sortMovers(ROWS, "sym");
    expect(
      ROWS.map((r) => {
        return r.symbol;
      }),
    ).toEqual(before);
  });

  test("rows with no quote yet sort last, never first", () => {
    const withNull = [
      { symbol: "ZZZZ", name: "Pending", last: null, changePct: null },
      ...ROWS,
    ];

    expect(sortMovers(withNull, "chg").at(-1)?.symbol).toBe("ZZZZ");
    expect(sortMovers(withNull, "price").at(-1)?.symbol).toBe("ZZZZ");
  });
});

describe("sparklinePoints", () => {
  test("maps closes across the full width and inverts y (screen coords)", () => {
    const pts = sparklinePoints([1, 2, 3], 100, 20);

    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 0, y: 20 });
    expect(pts[2]).toEqual({ x: 100, y: 0 });
  });

  test("a flat series sits on the vertical midline rather than dividing by zero", () => {
    const pts = sparklinePoints([5, 5, 5], 100, 20);

    expect(
      pts.every((p) => {
        return p.y === 10;
      }),
    ).toBe(true);
  });

  test("fewer than two closes yields no points — nothing to draw", () => {
    expect(sparklinePoints([], 100, 20)).toEqual([]);
    expect(sparklinePoints([5], 100, 20)).toEqual([]);
  });
});
