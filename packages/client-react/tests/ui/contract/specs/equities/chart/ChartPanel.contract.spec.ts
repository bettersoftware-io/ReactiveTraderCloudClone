import { ChartPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle, EquityInstrument, EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
];

const CANDLES: readonly Candle[] = [
  { time: 0, open: 100, high: 105, low: 98, close: 102 },
  { time: 60, open: 102, high: 108, low: 101, close: 104 },
];

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
    expect(panel.candleCount()).toBe(2);
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
    expect(panel.candleCount()).toBe(2);
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
