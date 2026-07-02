import { describe, expect, test } from "vitest";

import { chartVm } from "#/equities/chartVm";
import { genCandles } from "#/equities/equitiesData";
import type { EqSym } from "#/equities/types";
import { watchlistVm } from "#/equities/watchlistVm";
import { mulberry32 } from "#/mock/rng";

describe("chartVm", () => {
  test("emits one candle vm per bar, 4 grid lines and 4 price labels", () => {
    const series = genCandles("AAPL", "1D", mulberry32(2));
    const vm = chartVm(series, series[series.length - 1].c, false);
    expect(vm.candles).toHaveLength(40);
    expect(vm.grid).toHaveLength(4);
    expect(vm.labels).toHaveLength(4);
  });

  test("a live rate above the series high lifts the top price label", () => {
    const series = genCandles("AAPL", "1D", mulberry32(2));
    const high = Math.max(
      ...series.map((c) => {
        return c.h;
      }),
    );
    const normal = chartVm(series, series[series.length - 1].c, false);
    const spiked = chartVm(series, high + 5, false);
    // The top label is cmax - 0.12*crng; pushing the live last candle above
    // every high raises cmax, so that label rises too.
    expect(Number.parseFloat(spiked.labels[0].txt)).toBeGreaterThan(
      Number.parseFloat(normal.labels[0].txt),
    );
  });
});

describe("watchlistVm", () => {
  test("sorts by descending %-change and flags the selected row", () => {
    const rates: Record<EqSym, number> = {
      AAPL: 101,
      MSFT: 200,
      NVDA: 100,
      TSLA: 100,
      AMZN: 100,
      GOOGL: 100,
      META: 100,
      SPY: 100,
    };
    const prev: Record<EqSym, number> = {
      AAPL: 100,
      MSFT: 100,
      NVDA: 100,
      TSLA: 100,
      AMZN: 100,
      GOOGL: 100,
      META: 100,
      SPY: 100,
    };
    const flash = {} as WatchInput["flash"];

    for (const sym of Object.keys(rates) as EqSym[]) {
      flash[sym] = { dir: 1, ts: 0 };
    }

    const rows = watchlistVm({
      rates,
      prev,
      flash,
      sel: "AAPL",
      wlSort: "chg",
      now: 10_000,
    });
    expect(rows[0].sym).toBe("MSFT");
    expect(
      rows.find((r) => {
        return r.sym === "AAPL";
      })?.selected,
    ).toBe(true);
  });
});

type WatchInput = Parameters<typeof watchlistVm>[0];
