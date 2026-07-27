import { ChartPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";

import { generateCandles } from "./candleFixture";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
];

// 300 candles (not just the 2 that were here before Task C4): CandleChart now
// owns the pan/zoom viewport itself, so the panel's default render only shows
// the newest CANDLE_DEFAULT_VISIBLE["1D"] (60) of them — a real (if small)
// viewport-windowing behaviour that a 2-candle fixture couldn't exercise at
// all. lastPrice()/bid() below stay pinned to quote()'s hand-written values.
const CANDLES = generateCandles(300);

describe("ChartPanel", () => {
  it("shows a select-an-instrument placeholder when the workspace has no selection", () => {
    const panel = mount(ChartPanel, {});

    expect(panel.isEmpty()).toBe(true);
  });

  it("composes the header + candle plot for the workspace's selected symbol", () => {
    const panel = mount(ChartPanel, {
      equities: {
        watchlist: INSTRUMENTS,
        quotes: { AAPL: quote() },
        candles: { AAPL: CANDLES },
      },
    });

    expect(panel.isEmpty()).toBe(false);
    expect(panel.lastPrice()).toBe("104.00");
    expect(panel.bid()).toBe("103.90");
    // Windowed to the 1D default (60), not the full 300-candle series.
    expect(panel.candleCount()).toBe(60);
  });

  // ChartPanel.tsx: `chartVm(candles, quote?.last ?? 0, flashOn)` — an
  // instrument can be selected (from the watchlist) before its first quote
  // tick arrives, leaving `useEquityQuote(sel)` at its pre-tick `null`. The
  // panel must still render (0 as the live-last overlay) instead of crashing.
  it("renders without crashing when the selected instrument has no quote yet", () => {
    const panel = mount(ChartPanel, {
      equities: {
        watchlist: INSTRUMENTS,
        candles: { AAPL: CANDLES },
      },
    });

    expect(panel.isEmpty()).toBe(false);
    expect(panel.candleCount()).toBe(60);
  });
});

function quote(overrides: Partial<EquityQuote> = {}): EquityQuote {
  return {
    symbol: "AAPL",
    bid: 103.9,
    ask: 104.1,
    last: 104,
    changePct: 2,
    timestamp: 0,
    ...overrides,
  };
}
