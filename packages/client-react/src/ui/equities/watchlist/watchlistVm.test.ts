import { describe, expect, it } from "vitest";

import { sortWatchlistRows, type WatchlistRowInput } from "./watchlistVm";

const ROWS: readonly WatchlistRowInput[] = [
  { symbol: "TSLA", name: "Tesla Inc", last: 251.44, changePct: -1.2 },
  { symbol: "AAPL", name: "Apple Inc", last: 229.35, changePct: 0.5 },
  { symbol: "MSFT", name: "Microsoft Corp", last: 467.12, changePct: 2.1 },
];

describe("sortWatchlistRows", () => {
  it("sorts by symbol A–Z under 'sym'", () => {
    const sorted = sortWatchlistRows(ROWS, "sym");
    expect(
      sorted.map((r) => {
        return r.symbol;
      }),
    ).toEqual(["AAPL", "MSFT", "TSLA"]);
  });

  it("sorts by % change descending under 'chg'", () => {
    const sorted = sortWatchlistRows(ROWS, "chg");
    expect(
      sorted.map((r) => {
        return r.symbol;
      }),
    ).toEqual(["MSFT", "AAPL", "TSLA"]);
  });

  it("sorts by last price descending under 'price'", () => {
    const sorted = sortWatchlistRows(ROWS, "price");
    expect(
      sorted.map((r) => {
        return r.symbol;
      }),
    ).toEqual(["MSFT", "TSLA", "AAPL"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...ROWS];
    sortWatchlistRows(ROWS, "sym");
    expect(ROWS).toEqual(copy);
  });

  it("sorts unquoted rows (null last/changePct) to the end", () => {
    const withUnquoted: readonly WatchlistRowInput[] = [
      ...ROWS,
      { symbol: "AMZN", name: "Amazon.com", last: null, changePct: null },
    ];

    expect(sortWatchlistRows(withUnquoted, "chg").at(-1)?.symbol).toBe("AMZN");
    expect(sortWatchlistRows(withUnquoted, "price").at(-1)?.symbol).toBe(
      "AMZN",
    );
  });
});
